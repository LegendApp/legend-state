import {
    batch,
    beginBatch,
    dateModifiedKey,
    deconstructObjectWithPath,
    endBatch,
    isEmpty,
    isString,
    mergeIntoObservable,
    observable,
    symbolDateModified,
    tracking,
    when,
} from '@legendapp/state';
import type {
    Change,
    ClassConstructor,
    Observable,
    ObservableObject,
    ObservablePersistLocal,
    ObservablePersistRemote,
    ObservablePersistState,
    ObservableWriteable,
    PersistMetadata,
    PersistOptions,
    PersistOptionsLocal,
} from '../observableInterfaces';
import { observablePersistConfiguration } from './configureObservablePersistence';
import { invertFieldMap, transformObject, transformObjectWithPath } from './fieldTransformer';
import { mergeDateModified, replaceKeyInObject } from './persistHelpers';

export const mapPersistences: WeakMap<
    ClassConstructor<ObservablePersistLocal | ObservablePersistRemote>,
    ObservablePersistLocal | ObservablePersistRemote
> = new WeakMap();

export const persistState = observable({ inRemoteSync: false });

interface LocalState {
    persistenceLocal?: ObservablePersistLocal;
    persistenceRemote?: ObservablePersistRemote;
    pendingChanges?: Record<string, { p: any; v?: any }>;
}

function parseLocalConfig(config: string | PersistOptionsLocal): { table: string; config: PersistOptionsLocal } {
    return isString(config) ? { table: config, config: { name: config } } : { table: config.name, config };
}

async function onObsChange<T>(
    obs: Observable<T>,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T>,
    value: T,
    getPrevious: () => T,
    changes: Change[]
) {
    const { persistenceLocal, persistenceRemote } = localState;

    const local = persistOptions.local;
    const { table, config } = parseLocalConfig(local);
    const inRemoteChange = tracking.inRemoteChange;
    const saveRemote =
        !inRemoteChange && persistOptions.remote && !persistOptions.remote.readonly && obsState.isEnabledRemote.peek();

    if (local && obsState.isEnabledLocal.peek()) {
        if (!obsState.isLoadedLocal.peek()) {
            console.error(
                '[legend-state] WARNING: An observable was changed before being loaded from persistence',
                local
            );
            return;
        }

        // Prepare pending changes
        if (saveRemote) {
            for (let i = 0; i < changes.length; i++) {
                const { path, valueAtPath, prevAtPath } = changes[i];
                if (path[path.length - 1] === (symbolDateModified as any)) continue;
                const pathStr = path.join('/');

                if (!localState.pendingChanges) {
                    localState.pendingChanges = {};
                }
                // The value saved in pending should be the previous state before changes,
                // so don't overwrite it if it already exists
                if (!localState.pendingChanges[pathStr]) {
                    localState.pendingChanges[pathStr] = { p: prevAtPath ?? null };
                }

                localState.pendingChanges[pathStr].v = valueAtPath;
            }
        }

        // Save changes locally
        const changesLocal = changes.map(({ path, prevAtPath, valueAtPath }) => {
            let cloned = saveRemote
                ? replaceKeyInObject(valueAtPath, symbolDateModified, dateModifiedKey, /*clone*/ true)
                : valueAtPath;
            if (config.fieldTransforms) {
                const { obj, path: pathTransformed } = transformObjectWithPath(cloned, path, config.fieldTransforms);
                cloned = obj;
                path = pathTransformed;
            }
            return { path, prevAtPath, valueAtPath: cloned };
        });

        persistenceLocal.set(table, changesLocal, config);

        // Save metadata
        const metadata: PersistMetadata = {};

        if (inRemoteChange) {
            const dateModified = value[symbolDateModified];
            if (dateModified) {
                metadata.modified = dateModified;
            }
        }

        if (localState.pendingChanges !== undefined) {
            metadata.pending = localState.pendingChanges;
        }

        if (!isEmpty(metadata)) {
            persistenceLocal.updateMetadata(table, metadata, config);
        }
    }

    if (saveRemote) {
        await when(obsState.isLoadedRemote);

        const fieldTransforms = persistOptions.remote.fieldTransforms;

        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath, prevAtPath } = changes[i];
            if (path[path.length - 1] === (symbolDateModified as any)) continue;
            const pathStr = path.join('/');

            let pathSave = path;
            let valueSave = replaceKeyInObject(valueAtPath, symbolDateModified, dateModifiedKey, /*clone*/ true);

            if (fieldTransforms) {
                const { path: pathTransformed, obj } = transformObjectWithPath(valueAtPath, path, fieldTransforms);
                pathSave = pathTransformed;
                valueSave = obj;
            }

            const invertedMap = fieldTransforms && invertFieldMap(fieldTransforms);

            // Save to remote persistence and get the remote value from it. Some providers (like Firebase) will return a
            // server value with server timestamps for dateModified.
            persistenceRemote.save(persistOptions, pathSave, valueSave, prevAtPath).then((saved) => {
                if (local) {
                    const pending = persistenceLocal.getMetadata(table, config)?.pending;
                    let didDelete = false;

                    // Clear pending for this path
                    if (pending?.[pathStr]) {
                        didDelete = true;
                        // Remove pending from the saved object
                        delete pending[pathStr];
                        // Remove pending from local state
                        delete localState.pendingChanges[pathStr];
                    }
                    // Only the latest save will return a value so that it saves back to local persistence once
                    // It needs to get the dateModified from the save and update that through the observable
                    // which will fire onObsChange and save it locally.
                    if (saved !== undefined) {
                        if (invertedMap) {
                            saved = transformObjectWithPath(saved, pathSave, invertedMap).obj;
                        }

                        onChangeRemote(() => {
                            const obsChild = deconstructObjectWithPath(path, obs);
                            mergeDateModified(obsChild as Observable, saved);
                        });
                    }
                }
            });
        }
    }
}

function onChangeRemote(cb: () => void) {
    // Remote changes should only update local state
    persistState.inRemoteSync.set(true);
    tracking.inRemoteChange = true;

    try {
        beginBatch();
        cb();
    } finally {
        endBatch();
        tracking.inRemoteChange = false;
        persistState.inRemoteSync.set(false);
    }
}

async function loadLocal<T>(
    obs: ObservableWriteable<T>,
    persistOptions: PersistOptions,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState
) {
    const { local } = persistOptions;
    const localPersistence: ClassConstructor<ObservablePersistLocal> =
        persistOptions.persistLocal || observablePersistConfiguration.persistLocal;

    if (local) {
        const { table, config } = parseLocalConfig(local);
        if (!localPersistence) {
            throw new Error('Local persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(localPersistence)) {
            const persistenceLocal = new localPersistence();
            if (persistenceLocal.initialize) {
                await persistenceLocal.initialize?.(observablePersistConfiguration.persistLocalOptions);
            }
            mapPersistences.set(localPersistence, persistenceLocal);
        }
        const persistenceLocal = (localState.persistenceLocal = mapPersistences.get(
            localPersistence
        ) as ObservablePersistLocal);

        // If persistence has an asynchronous load, wait for it
        if (persistenceLocal.loadTable) {
            const promise = persistenceLocal.loadTable(table, config);
            if (promise) {
                await promise;
            }
        }

        // Get the value from state
        let value = persistenceLocal.getTable(table, config);
        const metadata = persistenceLocal.getMetadata(table, config);

        if (metadata) {
            const pending = metadata.pending;
            localState.pendingChanges = pending;
        }

        // Merge the data from local persistence into the default state
        if (value !== null && value !== undefined) {
            value = replaceKeyInObject(value, dateModifiedKey, symbolDateModified, /*clone*/ false);

            if (config.fieldTransforms) {
                // Get preloaded translated if available
                let valueLoaded = persistenceLocal.getTableTransformed(table, config);
                if (valueLoaded) {
                    value = valueLoaded;
                } else {
                    const inverted = invertFieldMap(config.fieldTransforms);
                    value = transformObject(value, inverted, [dateModifiedKey]);
                }
            }

            batch(() => {
                mergeIntoObservable(obs, value);
            });
        }

        obsState.peek().clearLocal = () => persistenceLocal.deleteTable(table, config);
    }
    obsState.isLoadedLocal.set(true);
}

export function persistObservable<T>(obs: ObservableWriteable<T>, persistOptions: PersistOptions<T>) {
    const obsState = observable<ObservablePersistState>({
        isLoadedLocal: false,
        isLoadedRemote: false,
        isEnabledLocal: true,
        isEnabledRemote: true,
        clearLocal: undefined,
        sync: () => Promise.resolve(),
    });

    const { remote, local } = persistOptions;
    const remotePersistence = persistOptions.persistRemote || observablePersistConfiguration?.persistRemote;
    const localState: LocalState = {};

    if (local) {
        loadLocal(obs, persistOptions, obsState, localState);
    }

    if (remote) {
        if (!remotePersistence) {
            throw new Error('Remote persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, new remotePersistence());
        }
        localState.persistenceRemote = mapPersistences.get(remotePersistence) as ObservablePersistRemote;

        let isSynced = false;
        const sync = async () => {
            if (!isSynced) {
                isSynced = true;
                localState.persistenceRemote.listen(
                    obs,
                    persistOptions,
                    () => {
                        obsState.isLoadedRemote.set(true);
                    },
                    onChangeRemote
                );

                await when(obsState.isLoadedRemote);

                const pending = localState.pendingChanges;
                if (pending) {
                    Object.keys(pending).forEach((key) => {
                        const path = key.split('/').filter((p) => p !== '');
                        const { p, v } = pending[key];
                        // TODO getPrevious if any remote persistence layers need it
                        onObsChange(
                            obs as Observable,
                            obsState,
                            localState,
                            persistOptions,
                            obs.peek(),
                            () => undefined,
                            [{ path, valueAtPath: v, prevAtPath: p }]
                        );
                    });
                }
            }
        };

        if (remote.manual) {
            obsState.assign({ sync });
        } else {
            when(() => !local || obsState.isLoadedLocal.get(), sync);
        }
    }

    when(obsState.isLoadedLocal, () => {
        obs.onChange(onObsChange.bind(this, obs, obsState, localState, persistOptions));
    });

    return obsState;
}
