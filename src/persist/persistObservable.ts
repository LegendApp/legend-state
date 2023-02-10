import {
    batch,
    beginBatch,
    constructObjectWithPath,
    deconstructObjectWithPath,
    endBatch,
    isEmpty,
    isPromise,
    isString,
    isSymbol,
    mergeIntoObservable,
    observable,
    setInObservableAtPath,
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
    ObservableReadable,
    ObservableWriteable,
    PersistMetadata,
    PersistOptions,
    PersistOptionsLocal,
    TypeAtPath,
} from '../observableInterfaces';
import { observablePersistConfiguration } from './configureObservablePersistence';
import { invertFieldMap, transformObject, transformObjectWithPath, transformPath } from './fieldTransformer';

export const mapPersistences: WeakMap<
    ClassConstructor<ObservablePersistLocal | ObservablePersistRemote>,
    {
        persist: ObservablePersistLocal | ObservablePersistRemote;
        initialized?: Observable<boolean>;
    }
> = new WeakMap();

export const persistState = observable({ inRemoteSync: false });
const metadatas = new WeakMap<ObservableReadable<any>, PersistMetadata>();

interface LocalState {
    persistenceLocal?: ObservablePersistLocal;
    persistenceRemote?: ObservablePersistRemote;
    pendingChanges?: Record<string, { p: any; v?: any; t: TypeAtPath[] }>;
    onSaveRemote?: () => void;
    isApplyingPending?: boolean;
}

function parseLocalConfig(config: string | PersistOptionsLocal): { table: string; config: PersistOptionsLocal } {
    return isString(config) ? { table: config, config: { name: config } } : { table: config.name, config };
}

let isMergingLocalData = false;

export function adjustSaveData(
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    {
        adjustData,
        fieldTransforms,
    }: { adjustData?: { save?: (value: any) => any }; fieldTransforms?: FieldTransforms<any> }
): { value: any; path: string[] } | Promise<{ value: any; path: string[] }> {
    if (fieldTransforms || adjustData?.save) {
        const transform = () => {
            if (fieldTransforms) {
                const { obj, path: pathTransformed } = transformObjectWithPath(value, path, pathTypes, fieldTransforms);
                value = obj;
                path = pathTransformed;
            }

            return { value, path };
        };

        if (adjustData?.save) {
            let constructed = constructObjectWithPath(path, value, pathTypes);
            const saved = adjustData.save(constructed);
            const deconstruct = (toDeconstruct) => {
                value = deconstructObjectWithPath(path, toDeconstruct);
                return transform();
            };
            return isPromise(saved) ? saved.then(deconstruct) : deconstruct(saved);
        }
        return transform();
    }

    return { value, path };
}

export function adjustLoadData(
    value: any,
    {
        adjustData,
        fieldTransforms,
    }: { fieldTransforms?: FieldTransforms<any>; adjustData?: { load?: (value: any) => any } }
): Promise<any> | any {
    if (fieldTransforms) {
        const inverted = invertFieldMap(fieldTransforms);
        value = transformObject(value, inverted);
    }

    if (adjustData?.load) {
        value = adjustData.load(value);
    }

    return value;
}

function updateMetadata<T>(
    obs: ObservableReadable<any>,
    localState: LocalState,
    obsState: ObservableObject<ObservablePersistState>,
    persistOptions: PersistOptions<T>,
    newMetadata: PersistMetadata
) {
    const { persistenceLocal } = localState;
    const local = persistOptions.local;
    const { table, config } = parseLocalConfig(local);

    // Save metadata
    let oldMetadata: PersistMetadata = metadatas.get(obs);

    const { modified, pending } = newMetadata;

    const needsUpdate =
        (modified || pending) && (!oldMetadata || modified !== oldMetadata.modified || pending !== oldMetadata.pending);

    if (needsUpdate) {
        const metadata = Object.assign({}, oldMetadata, newMetadata);
        metadatas.set(obs, metadata);
        persistenceLocal.updateMetadata(table, metadata, config);

        if (modified) {
            obsState.dateModified.set(modified);
        }
    }
}

async function onObsChange<T>(
    obs: Observable<T>,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T>,
    { changes }: ListenerParams
) {
    const { persistenceLocal, persistenceRemote, isApplyingPending } = localState;

    const local = persistOptions.local;
    const { table, config } = parseLocalConfig(local);
    const configRemote = persistOptions.remote;
    const inRemoteChange = tracking.inRemoteChange;
    const saveRemote =
        !isMergingLocalData &&
        !inRemoteChange &&
        configRemote &&
        !configRemote.readonly &&
        obsState.isEnabledRemote.peek();

    const isQueryingModified = !!configRemote?.firebase?.queryByModified;

    if (local && !config.readonly && !isApplyingPending && obsState.isEnabledLocal.peek()) {
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
            const pathStr = pathOriginal.join('/');

            // Optimization to only save the latest update at each path. We might have multiple changes at the same path
            // and we only need the latest value, so it starts from the end of the array, skipping any earlier changes
            // already processed.
            if (!changesPaths.has(pathStr)) {
                changesPaths.add(pathStr);

                let promise = adjustSaveData(valueAtPath, pathOriginal as string[], pathTypes, config);

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
        updateMetadata(obs, localState, obsState, persistOptions, {
            pending: localState.pendingChanges,
        });
    }

    if (saveRemote) {
        await when(
            () => obsState.isLoadedRemote.get() || (configRemote.allowSaveIfError && obsState.remoteError.get())
        );

        changes.forEach(async (change) => {
            const { path, valueAtPath, prevAtPath, pathTypes } = change;
            const pathStr = path.join('/');

            const { path: pathSave, value: valueSave } = await adjustSaveData(
                valueAtPath,
                path as string[],
                pathTypes,
                configRemote
            );

            // Save to remote persistence
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
                .then(() => {
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
                    }
                    localState.onSaveRemote?.();
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
            metadatas.set(obs, metadata);
            localState.pendingChanges = metadata.pending;
            obsState.dateModified.set(metadata.modified);
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

            value = adjustLoadData(value, { adjustData, fieldTransforms });

            if (isPromise(value)) {
                value = await value;
            }

            batch(
                () => {
                    // isMergingLocalData prevents saving remotely when two different persistences
                    // are set on the same observable
                    isMergingLocalData = true;
                    // We want to merge the local data on top of any initial state the object is created with
                    mergeIntoObservable(obs, value);
                },
                () => {
                    isMergingLocalData = false;
                }
            );
        }

        obsState.peek().clearLocal = () => persistenceLocal.deleteTable(table, config);
    }
    obsState.isLoadedLocal.set(true);
}

export function persistObservable<T>(obs: ObservableWriteable<T>, persistOptions: PersistOptions<T>) {
    const { remote, local } = persistOptions;
    const remotePersistence = persistOptions.persistRemote || observablePersistConfiguration?.persistRemote;
    const localState: LocalState = {};

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
                localState.onSaveRemote = persistOptions.remote?.onSaveRemote;
                const dateModified = metadatas.get(obs)?.modified;
                localState.persistenceRemote.listen({
                    state: obsState,
                    obs,
                    options: persistOptions,
                    dateModified,
                    onLoad: () => {
                        obsState.isLoadedRemote.set(true);
                    },
                    onChange: async ({ value, path, mode, dateModified }) => {
                        if (value !== undefined) {
                            value = adjustLoadData(value, remote);
                            if (isPromise(value)) {
                                value = await value;
                            }

                            if (mode === 'dateModified') {
                                if (!isEmpty(value as unknown as object)) {
                                    onChangeRemote(() => {
                                        setInObservableAtPath(obs, path as string[], value, 'assign');
                                    });
                                }
                            } else {
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
                                    setInObservableAtPath(obs, path as string[], value, mode);
                                });
                            }
                        }
                        if (dateModified) {
                            updateMetadata(obs, localState, obsState, persistOptions, {
                                modified: dateModified,
                            });
                        }
                    },
                });

                await when(
                    () => obsState.isLoadedRemote.get() || (remote.allowSaveIfError && obsState.remoteError.get())
                );

                const pending = localState.pendingChanges;
                if (pending) {
                    localState.isApplyingPending = true;
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
                    localState.isApplyingPending = false;
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
