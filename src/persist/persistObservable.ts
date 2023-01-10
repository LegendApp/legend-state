import {
    batch,
    beginBatch,
    constructObjectWithPath,
    dateModifiedKey,
    deconstructObjectWithPath,
    endBatch,
    isEmpty,
    isPromise,
    isString,
    isSymbol,
    mergeIntoObservable,
    observable,
    setAtPath,
    symbolDateModified,
    tracking,
    when,
} from '@legendapp/state';
import type {
    Change,
    ClassConstructor,
    FieldTransforms,
    ListenerParams,
    Observable,
    ObservableObject,
    ObservablePersistLocal,
    ObservablePersistRemote,
    ObservablePersistState,
    ObservableWriteable,
    PersistMetadata,
    PersistOptions,
    PersistOptionsLocal,
    TypeAtPath,
} from '../observableInterfaces';
import { observablePersistConfiguration } from './configureObservablePersistence';
import { invertFieldMap, transformObject, transformObjectWithPath, transformPath } from './fieldTransformer';
import { mergeDateModified, replaceKeyInObject } from './persistHelpers';

export const mapPersistences: WeakMap<
    ClassConstructor<ObservablePersistLocal | ObservablePersistRemote>,
    {
        persist: ObservablePersistLocal | ObservablePersistRemote;
        initialized?: Observable<boolean>;
    }
> = new WeakMap();

export const persistState = observable({ inRemoteSync: false });

interface LocalState {
    persistenceLocal?: ObservablePersistLocal;
    persistenceRemote?: ObservablePersistRemote;
    pendingChanges?: Record<string, { p: any; v?: any; t: TypeAtPath[] }>;
    onSaveRemoteListeners: (() => void)[];
}

function parseLocalConfig(config: string | PersistOptionsLocal): { table: string; config: PersistOptionsLocal } {
    return isString(config) ? { table: config, config: { name: config } } : { table: config.name, config };
}

function adjustSaveData(
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    {
        adjustData,
        fieldTransforms,
    }: { adjustData?: { save?: (value: any) => any }; fieldTransforms?: FieldTransforms<any> },
    replaceKey?: boolean
): { value: any; path: string[] } | Promise<{ value: any; path: string[] }> {
    let cloned = replaceKey ? replaceKeyInObject(value, symbolDateModified, dateModifiedKey, /*clone*/ true) : value;

    const transform = () => {
        if (fieldTransforms) {
            const { obj, path: pathTransformed } = transformObjectWithPath(cloned, path, pathTypes, fieldTransforms);
            cloned = obj;
            path = pathTransformed;
        }

        return { value: cloned, path };
    };

    let promise;
    if (adjustData?.save) {
        const constructed = constructObjectWithPath(path, cloned, pathTypes);
        promise = adjustData.save(constructed);
    }

    return isPromise(promise)
        ? promise.then((adjusted) => {
              cloned = deconstructObjectWithPath(path, adjusted);
              return transform();
          })
        : transform();
}

function adjustLoadData(
    value: any,
    {
        adjustData,
        fieldTransforms,
    }: { fieldTransforms?: FieldTransforms<any>; adjustData?: { load?: (value: any) => any } },
    replaceKey?: boolean
): Promise<any> | any {
    let cloned = replaceKey ? replaceKeyInObject(value, dateModifiedKey, symbolDateModified, /*clone*/ true) : value;

    if (fieldTransforms) {
        const inverted = invertFieldMap(fieldTransforms);
        cloned = transformObject(cloned, inverted, [dateModifiedKey]);
    }

    if (adjustData?.load) {
        cloned = adjustData.load(cloned);
    }

    return cloned;
}

async function onObsChange<T>(
    obs: Observable<T>,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T>,
    { value, changes }: ListenerParams
) {
    const { persistenceLocal, persistenceRemote } = localState;

    const local = persistOptions.local;
    const { table, config } = parseLocalConfig(local);
    const configRemote = persistOptions.remote;
    const inRemoteChange = tracking.inRemoteChange;
    const saveRemote = !inRemoteChange && configRemote && !configRemote.readonly && obsState.isEnabledRemote.peek();

    const isQueryingModified = !!configRemote?.firebase?.queryByModified;

    if (local && !config.readonly && obsState.isEnabledLocal.peek()) {
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
                const { path, valueAtPath, prevAtPath, pathTypes } = changes[i];
                if (path[path.length - 1] === (symbolDateModified as any)) continue;
                const pathStr = path.join('/');

                if (!localState.pendingChanges) {
                    localState.pendingChanges = {};
                }
                // The value saved in pending should be the previous state before changes,
                // so don't overwrite it if it already exists
                if (!localState.pendingChanges[pathStr]) {
                    localState.pendingChanges[pathStr] = { p: prevAtPath ?? null, t: pathTypes };
                }

                localState.pendingChanges[pathStr].v = valueAtPath;
            }
        }

        // Save changes locally
        const changesLocal: Change[] = [];
        const changesPaths = new Set<string>();

        const promises = [];
        changes.forEach((_, i) => {
            // Reverse order
            let { path: pathOriginal, prevAtPath, valueAtPath, pathTypes } = changes[changes.length - 1 - i];

            if (isSymbol(pathOriginal[pathOriginal.length - 1])) {
                return;
            }
            if (isQueryingModified) {
                pathOriginal = pathOriginal.map((p) => ((p as any) === symbolDateModified ? dateModifiedKey : p));
            }
            const pathStr = pathOriginal.join('/');

            // Optimization to only save the latest update at each path. We might have multiple changes at the same path
            // and we only need the latest value, so it starts from the end of the array, skipping any earlier changes
            // already processed.
            if (!changesPaths.has(pathStr)) {
                changesPaths.add(pathStr);

                let promise = adjustSaveData(
                    valueAtPath,
                    pathOriginal as string[],
                    pathTypes,
                    config,
                    isQueryingModified
                );

                const push = ({ path, value }) => {
                    changesLocal.push({ path, pathTypes, prevAtPath, valueAtPath: value });
                };

                if (isPromise(promise)) {
                    promises.push(promise.then(push));
                } else {
                    push(promise);
                }
            }
        });

        if (promises.length > 0) {
            await Promise.all(promises);
        }

        if (changesLocal.length > 0) {
            persistenceLocal.set(table, changesLocal, config);
        }

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
        await when(
            () => obsState.isLoadedRemote.get() || (configRemote.allowSaveIfError && obsState.remoteError.get())
        );

        const fieldTransforms = configRemote.fieldTransforms;

        changes.forEach(async (change) => {
            const { path, valueAtPath, prevAtPath, pathTypes } = change;
            if (path[path.length - 1] === (symbolDateModified as any)) return;
            const pathStr = path.join('/');

            const { path: pathSave, value: valueSave } = await adjustSaveData(
                valueAtPath,
                path as string[],
                pathTypes,
                configRemote,
                isQueryingModified
            );

            // Save to remote persistence and get the remote value from it. Some providers (like Firebase) will return a
            // server value with server timestamps for dateModified.
            persistenceRemote
                .save({
                    obs,
                    state: obsState,
                    options: persistOptions,
                    path: pathSave,
                    pathTypes,
                    valueAtPath: valueSave,
                    prevAtPath,
                })
                .then((saved) => {
                    if (local) {
                        const pending = persistenceLocal.getMetadata(table, config)?.pending;

                        // Clear pending for this path
                        if (pending?.[pathStr]) {
                            // Remove pending from the saved object
                            delete pending[pathStr];
                            // Remove pending from local state
                            delete localState.pendingChanges[pathStr];

                            persistenceLocal.updateMetadata(table, { pending }, config);
                        }
                        // Only the latest save will return a value so that it saves back to local persistence once
                        // It needs to get the dateModified from the save and update that through the observable
                        // which will fire onObsChange and save it locally.
                        if (saved !== undefined && isQueryingModified) {
                            // Note: Don't need to adjust data because we're just merging dateModified
                            const invertedMap = fieldTransforms && invertFieldMap(fieldTransforms);

                            if (invertedMap) {
                                saved = transformObject(saved, invertedMap, [dateModifiedKey]) as T;
                            }

                            onChangeRemote(() => {
                                mergeDateModified(obs as ObservableWriteable, saved);
                            });
                        }
                    }
                    localState.onSaveRemoteListeners.forEach((cb) => cb());
                });
        });
    }
}

export function onChangeRemote(cb: () => void) {
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
    const { local, remote } = persistOptions;
    const localPersistence: ClassConstructor<ObservablePersistLocal> =
        persistOptions.persistLocal || observablePersistConfiguration.persistLocal;

    if (local) {
        const { table, config } = parseLocalConfig(local);
        const isQueryingModified = !!persistOptions.remote?.firebase?.queryByModified;

        if (!localPersistence) {
            throw new Error('Local persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(localPersistence)) {
            const persistenceLocal = new localPersistence();
            const mapValue = { persist: persistenceLocal, initialized: observable(false) };
            mapPersistences.set(localPersistence, mapValue);
            if (persistenceLocal.initialize) {
                const initializePromise = persistenceLocal.initialize?.(
                    observablePersistConfiguration.persistLocalOptions
                );
                if (isPromise(initializePromise)) {
                    await initializePromise;
                }
            }
            mapValue.initialized.set(true);
        }

        const { persist: persistenceLocal, initialized } = mapPersistences.get(localPersistence) as {
            persist: ObservablePersistLocal;
            initialized: Observable<boolean>;
        };

        localState.persistenceLocal = persistenceLocal;

        if (!initialized.get()) {
            await when(initialized);
        }

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
            let { adjustData, fieldTransforms } = config;
            if (fieldTransforms) {
                let valueLoaded = persistenceLocal.getTableTransformed?.(table, config);
                if (valueLoaded) {
                    value = valueLoaded;
                    fieldTransforms = undefined;
                }
            }

            value = adjustLoadData(value, { adjustData, fieldTransforms }, !!remote && isQueryingModified);

            if (isPromise(value)) {
                value = await value;
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
    const { remote, local } = persistOptions;
    const remotePersistence = persistOptions.persistRemote || observablePersistConfiguration?.persistRemote;
    const onSaveRemoteListeners: (() => void)[] = [];
    const localState: LocalState = { onSaveRemoteListeners };

    const obsState = observable<ObservablePersistState>({
        isLoadedLocal: false,
        isLoadedRemote: false,
        isEnabledLocal: true,
        isEnabledRemote: true,
        clearLocal: undefined,
        sync: () => Promise.resolve(),
        getPendingChanges: () => localState.pendingChanges,
    });

    if (local) {
        loadLocal(obs, persistOptions, obsState, localState);
    }

    if (remote) {
        if (!remotePersistence) {
            throw new Error('Remote persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, { persist: new remotePersistence() });
        }
        localState.persistenceRemote = mapPersistences.get(remotePersistence).persist as ObservablePersistRemote;

        let isSynced = false;
        const sync = async () => {
            if (!isSynced) {
                isSynced = true;
                const onSaveRemote = persistOptions.remote?.onSaveRemote;
                if (onSaveRemote) {
                    onSaveRemoteListeners.push(onSaveRemote);
                }
                localState.persistenceRemote.listen({
                    state: obsState,
                    obs,
                    options: persistOptions,
                    onLoad: () => {
                        obsState.isLoadedRemote.set(true);
                    },
                    onChange: async ({ value, path }) => {
                        if (value !== undefined) {
                            value = adjustLoadData(value, remote, true);
                            if (isPromise(value)) {
                                value = await value;
                            }
                            const pending = localState.pendingChanges;
                            if (pending) {
                                Object.keys(pending).forEach((key) => {
                                    const p = key.split('/').filter((p) => p !== '');
                                    const { v, t } = pending[key];

                                    const constructed = constructObjectWithPath(p, v, t);
                                    value = mergeIntoObservable(value as any, constructed) as T;
                                });
                            }
                            const invertedMap = remote.fieldTransforms && invertFieldMap(remote.fieldTransforms);

                            if (path.length && invertedMap) {
                                path = transformPath(path as string[], invertedMap);
                            }
                            onChangeRemote(() => {
                                setAtPath(obs, path as string[], value);
                            });
                        }
                    },
                });

                await when(
                    () => obsState.isLoadedRemote.get() || (remote.allowSaveIfError && obsState.remoteError.get())
                );

                const pending = localState.pendingChanges;
                if (pending) {
                    Object.keys(pending).forEach((key) => {
                        const path = key.split('/').filter((p) => p !== '');
                        const { p, v, t } = pending[key];
                        // TODO getPrevious if any remote persistence layers need it
                        onObsChange(obs as Observable, obsState, localState, persistOptions, {
                            value: obs.peek(),
                            getPrevious: () => undefined,
                            changes: [{ path, valueAtPath: v, prevAtPath: p, pathTypes: t }],
                        });
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
