import type {
    Change,
    ClassConstructor,
    FieldTransforms,
    ListenerParams,
    Observable,
    ObservableObject,
    ObservablePersistLocal,
    ObservablePersistRemoteClass,
    ObservablePersistRemoteFunctions,
    ObservablePersistState,
    ObservableReadable,
    ObservableWriteable,
    PersistMetadata,
    PersistOptions,
    PersistOptionsLocal,
    PersistOptionsRemote,
    TypeAtPath,
} from '@legendapp/state';
import {
    batch,
    constructObjectWithPath,
    deconstructObjectWithPath,
    internal,
    isEmpty,
    isObject,
    isPromise,
    isString,
    mergeIntoObservable,
    observable,
    setAtPath,
    setInObservableAtPath,
    when,
} from '@legendapp/state';
import { observablePersistConfiguration } from './configureObservablePersistence';
import { invertFieldMap, transformObject, transformObjectWithPath, transformPath } from './fieldTransformer';
import { observablePersistRemoteFunctionsAdapter } from './observablePersistRemoteFunctionsAdapter';

export const mapPersistences: WeakMap<
    ClassConstructor<ObservablePersistLocal | ObservablePersistRemoteClass>,
    {
        persist: ObservablePersistLocal | ObservablePersistRemoteClass;
        initialized?: Observable<boolean>;
    }
> = new WeakMap();

export const persistState = observable({ inRemoteSync: false });
const metadatas = new WeakMap<ObservableReadable<any>, PersistMetadata>();
const promisesLocalSaves = new Set<Promise<void>>();

interface LocalState<TState = {}> {
    persistenceLocal?: ObservablePersistLocal;
    persistenceRemote?: ObservablePersistRemoteClass<TState>;
    pendingChanges?: Record<string, { p: any; v?: any; t: TypeAtPath[] }>;
    isApplyingPending?: boolean;
    timeoutSaveMetadata?: any;
}

type ChangeWithPathStr = Change & { pathStr: string };

function parseLocalConfig(config: string | PersistOptionsLocal | undefined): {
    table: string;
    config: PersistOptionsLocal;
} {
    return config
        ? isString(config)
            ? { table: config, config: { name: config } }
            : { table: config.name, config }
        : ({} as { table: string; config: PersistOptionsLocal });
}

function doInOrder<T>(arg1: T | Promise<T>, arg2: (value: T) => void): any {
    return isPromise(arg1) ? arg1.then(arg2) : arg2(arg1);
}

export function adjustSaveData(
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    {
        adjustData,
        fieldTransforms,
    }: { adjustData?: { save?: (value: any) => any }; fieldTransforms?: FieldTransforms<any> },
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
            const constructed = constructObjectWithPath(path, value, pathTypes);
            const saved = adjustData.save(constructed);
            const deconstruct = (toDeconstruct: boolean) => {
                value = deconstructObjectWithPath(path, toDeconstruct);
                return transform();
            };
            return doInOrder(saved, deconstruct);
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
    }: { fieldTransforms?: FieldTransforms<any>; adjustData?: { load?: (value: any) => any } },
    doUserAdjustData: boolean,
): Promise<any> | any {
    if (fieldTransforms) {
        const inverted = invertFieldMap(fieldTransforms);
        value = transformObject(value, inverted);
    }

    if (doUserAdjustData && adjustData?.load) {
        value = adjustData.load(value);
    }

    return value;
}

async function updateMetadataImmediate<T, TState = {}>(
    obs: ObservableReadable<any>,
    localState: LocalState<TState>,
    obsState: ObservableObject<ObservablePersistState>,
    persistOptions: PersistOptions<T>,
    newMetadata: PersistMetadata,
) {
    const saves = Array.from(promisesLocalSaves);
    if (saves.length > 0) {
        await Promise.all(saves);
    }

    const { persistenceLocal } = localState;
    const local = persistOptions.local;
    const { table, config } = parseLocalConfig(local!);

    // Save metadata
    const oldMetadata: PersistMetadata | undefined = metadatas.get(obs);

    const { modified, pending } = newMetadata;

    const needsUpdate = pending || (modified && (!oldMetadata || modified !== oldMetadata.modified));

    if (needsUpdate) {
        const metadata = Object.assign({}, oldMetadata, newMetadata);
        metadatas.set(obs, metadata);
        if (persistenceLocal) {
            await persistenceLocal!.setMetadata(table, metadata, config);
        }

        if (modified) {
            obsState.dateModified.set(modified);
        }
    }
}

function updateMetadata<T, TState = {}>(
    obs: ObservableReadable<any>,
    localState: LocalState<TState>,
    obsState: ObservableObject<ObservablePersistState>,
    persistOptions: PersistOptions<T, TState>,
    newMetadata: PersistMetadata,
) {
    if (localState.timeoutSaveMetadata) {
        clearTimeout(localState.timeoutSaveMetadata);
    }
    localState.timeoutSaveMetadata = setTimeout(
        () => updateMetadataImmediate(obs, localState, obsState, persistOptions, newMetadata),
        30,
    );
}

interface QueuedChange<T = any, TState = any> {
    inRemoteChange: boolean;
    isApplyingPending: boolean;
    obs: Observable<T>;
    obsState: ObservableObject<ObservablePersistState>;
    localState: LocalState<TState>;
    persistOptions: PersistOptions<T, TState>;
    changes: ListenerParams['changes'];
}

let _queuedChanges: QueuedChange[] = [];

async function processQueuedChanges() {
    // Get a local copy of the queued changes and clear the global queue
    const queuedChanges = _queuedChanges;
    _queuedChanges = [];

    // Note: Summary of the order of operations these functions:
    // 1. Prepare all changes for saving. This may involve waiting for promises if the user has asynchronous adjustData.
    // We need to prepare all of the changes in the queue before saving so that the saves happen in the correct order,
    // since some may take longer to adjustSaveData than others.
    const changes = await Promise.all(queuedChanges.map(prepChange));
    // 2. Save pending to the metadata table first. If this is the only operation that succeeds, it would try to save
    // the current value again on next load, which isn't too bad.
    // 3. Save local changes to storage. If they never make it to remote, then on the next load they will be pending
    // and attempted again.
    // 4. Wait for remote load or error if allowed
    // 5. Save to remote
    // 6. On successful save, merge changes (if any) back into observable
    // 7. Lastly, update metadata to clear pending and update dateModified. Doing this earlier could potentially cause
    // sync inconsistences so it's very important that this is last.
    changes.forEach(doChange);
}

async function prepChange(queuedChange: QueuedChange) {
    const { obsState, changes, localState, persistOptions, inRemoteChange, isApplyingPending } = queuedChange;

    const local = persistOptions.local;
    const { persistenceRemote } = localState;
    const { config: configLocal } = parseLocalConfig(local!);
    const configRemote = persistOptions.remote;
    const saveLocal = local && !configLocal.readonly && !isApplyingPending && obsState.isEnabledLocal.peek();
    const saveRemote =
        !inRemoteChange && persistenceRemote && !configRemote?.readonly && obsState.isEnabledRemote.peek();

    if (saveLocal || saveRemote) {
        if (saveLocal && !obsState.isLoadedLocal.peek()) {
            console.error(
                '[legend-state] WARNING: An observable was changed before being loaded from persistence',
                local,
            );
            return;
        }
        const changesLocal: ChangeWithPathStr[] = [];
        const changesRemote: ChangeWithPathStr[] = [];
        const changesPaths = new Set<string>();
        let promisesAdjustData: (void | Promise<any>)[] = [];

        // Reverse order
        for (let i = changes.length - 1; i >= 0; i--) {
            const { path } = changes[i];

            let found = false;

            // Optimization to only save the latest update at each path. We might have multiple changes at the same path
            // and we only need the latest value, so it starts from the end of the array, skipping any earlier changes
            // already processed. If a later change modifies a parent of an earlier change (which happens on delete()
            // it should be ignored as it's superseded by the parent modification.
            if (changesPaths.size > 0) {
                for (let u = 0; u < path.length; u++) {
                    if (changesPaths.has((u === path.length - 1 ? path : path.slice(0, u + 1)).join('/'))) {
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                const pathStr = path.join('/');
                changesPaths.add(pathStr);

                const { prevAtPath, valueAtPath, pathTypes } = changes[i];
                if (saveLocal) {
                    const promiseAdjustLocal = adjustSaveData(valueAtPath, path as string[], pathTypes, configLocal);

                    promisesAdjustData.push(
                        doInOrder(promiseAdjustLocal, ({ path: pathAdjusted, value: valueAdjusted }) => {
                            // If path includes undefined there was a null in fieldTransforms so don't need to save it
                            if (!pathAdjusted.includes(undefined as unknown as string)) {
                                // Prepare the local change with the adjusted path/value
                                changesLocal.push({
                                    path: pathAdjusted,
                                    pathTypes,
                                    prevAtPath,
                                    valueAtPath: valueAdjusted,
                                    pathStr,
                                });
                            }
                        }),
                    );
                }

                if (saveRemote) {
                    const promiseAdjustRemote = adjustSaveData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        configRemote || {},
                    );

                    promisesAdjustData.push(
                        doInOrder(promiseAdjustRemote, ({ path: pathAdjusted, value: valueAdjusted }) => {
                            // If path includes undefined there was a null in fieldTransforms so don't need to save it
                            if (!pathAdjusted.includes(undefined as unknown as string)) {
                                // Prepare pending changes
                                if (!localState.pendingChanges) {
                                    localState.pendingChanges = {};
                                }
                                // The "p" saved in pending should be the previous state before changes,
                                // so don't overwrite it if it already exists
                                if (!localState.pendingChanges[pathStr]) {
                                    localState.pendingChanges[pathStr] = { p: prevAtPath ?? null, t: pathTypes };
                                }

                                // Pending value is the unadjusted value because it gets loaded without adjustment
                                // and forwarded through to onObsChange where it gets adjusted before save
                                localState.pendingChanges[pathStr].v = valueAtPath;

                                // Prepare the remote change with the adjusted path/value
                                changesRemote.push({
                                    path: pathAdjusted,
                                    pathTypes,
                                    prevAtPath,
                                    valueAtPath: valueAdjusted,
                                    pathStr,
                                });
                            }
                        }),
                    );
                }
            }
        }

        // If there's any adjustData promises, wait for them before saving
        promisesAdjustData = promisesAdjustData.filter(Boolean);
        if (promisesAdjustData.length > 0) {
            await Promise.all(promisesAdjustData);
        }

        return { queuedChange, changesLocal, changesRemote };
    }
}

async function doChange(
    changeInfo:
        | {
              queuedChange: QueuedChange;
              changesLocal: ChangeWithPathStr[];
              changesRemote: ChangeWithPathStr[];
          }
        | undefined,
) {
    if (!changeInfo) return;

    const { queuedChange, changesLocal, changesRemote } = changeInfo;
    const { obs, obsState, localState, persistOptions } = queuedChange;
    const { persistenceLocal, persistenceRemote } = localState;

    const local = persistOptions.local;
    const { table, config: configLocal } = parseLocalConfig(local!);
    const configRemote = persistOptions.remote;
    const shouldSaveMetadata = local && configRemote?.offlineStrategy === 'retry';

    if (changesRemote.length > 0 && shouldSaveMetadata) {
        // First save pending changes before saving local or remote
        await updateMetadataImmediate(obs, localState, obsState, persistOptions, {
            pending: localState.pendingChanges,
        });
    }

    if (changesLocal.length > 0) {
        // Save the changes to local persistence before saving to remote. They are already marked as pending so
        // if remote sync fails or the app is closed before remote sync, it will attempt to sync them on the next load.
        let promiseSet = persistenceLocal!.set(table, changesLocal, configLocal);

        if (promiseSet) {
            promiseSet = promiseSet.then(() => {
                promisesLocalSaves.delete(promiseSet as Promise<any>);
            });
            // Keep track of local save promises so that updateMetadata runs only after everything is saved
            promisesLocalSaves.add(promiseSet);

            // await the local save before proceeding to save remotely
            await promiseSet;
        }
    }

    if (changesRemote.length > 0) {
        // Wait for remote to be ready before saving
        await when(
            () => obsState.isLoadedRemote.get() || (configRemote?.allowSaveIfError && obsState.remoteError.get()),
        );

        const value = obs.peek();

        configRemote?.onBeforeSaveRemote?.();

        const saves = await Promise.all(
            changesRemote.map(async (change) => {
                const { path, valueAtPath, prevAtPath, pathTypes, pathStr } = change;

                // Save to remote persistence
                return persistenceRemote!.set!({
                    obs,
                    state: obsState,
                    options: persistOptions,
                    path: path,
                    pathTypes,
                    valueAtPath,
                    prevAtPath,
                    value,
                })
                    .then((saved) =>
                        saved ? { changes: saved.changes, dateModified: saved.dateModified, pathStr } : undefined,
                    )
                    .catch((err) => configRemote?.onSaveError?.(err));
            }),
        );

        // If this remote save changed anything then update persistence and metadata
        // Because save happens after a timeout and they're batched together, some calls to save will
        // return saved data and others won't, so those can be ignored.
        if (saves.filter(Boolean).length > 0) {
            if (local) {
                const metadata: PersistMetadata = {};
                const pending = persistenceLocal!.getMetadata(table, configLocal)?.pending;
                let adjustedChanges: any[] = [];

                for (let i = 0; i < saves.length; i++) {
                    const save = saves[i];
                    if (save) {
                        const { changes, dateModified, pathStr } = save;
                        // Clear pending for this path
                        if (pending?.[pathStr]) {
                            // Remove pending from the saved object
                            delete pending[pathStr];
                            // Remove pending from local state
                            delete localState.pendingChanges![pathStr];
                            metadata.pending = pending;
                        }

                        if (dateModified) {
                            metadata.modified = dateModified;
                        }

                        // Remote can optionally have data that needs to be merged back into the observable,
                        // for example Firebase may update dateModified with the server timestamp
                        if (changes && !isEmpty(changes)) {
                            adjustedChanges.push(adjustLoadData(changes, persistOptions.remote!, false));
                        }
                    }
                }

                if (adjustedChanges.length > 0) {
                    if (adjustedChanges.some((change) => isPromise(change))) {
                        adjustedChanges = await Promise.all(adjustedChanges);
                    }
                    onChangeRemote(() => mergeIntoObservable(obs, ...adjustedChanges));
                }

                if (shouldSaveMetadata && !isEmpty(metadata)) {
                    updateMetadata(obs, localState, obsState, persistOptions, metadata);
                }
            }
            configRemote?.onSaveRemote?.();
        }
    }
}

function onObsChange<T, TState = {}>(
    obs: Observable<T>,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T, TState>,
    { changes }: ListenerParams,
) {
    if (!internal.globalState.isLoadingLocal) {
        const inRemoteChange = internal.globalState.isLoadingRemote;
        const isApplyingPending = localState.isApplyingPending;
        // Queue changes in a microtask so that multiple changes within a frame get run together
        _queuedChanges.push({
            obs: obs as Observable<any>,
            obsState,
            localState,
            persistOptions,
            changes,
            inRemoteChange,
            isApplyingPending: isApplyingPending!,
        });
        if (_queuedChanges.length === 1) {
            queueMicrotask(processQueuedChanges);
        }
    }
}

export function onChangeRemote(cb: () => void) {
    when(
        () => !persistState.inRemoteSync.get(),
        () => {
            // Remote changes should only update local state
            persistState.inRemoteSync.set(true);
            internal.globalState.isLoadingRemote = true;

            batch(cb, () => {
                internal.globalState.isLoadingRemote = false;
                persistState.inRemoteSync.set(false);
            });
        },
    );
}

async function loadLocal<T>(
    obs: ObservableWriteable<T>,
    persistOptions: PersistOptions<any, any>,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState,
) {
    const { local } = persistOptions;
    const localPersistence: ClassConstructor<ObservablePersistLocal> =
        persistOptions.persistLocal! || observablePersistConfiguration.persistLocal;

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
                    observablePersistConfiguration.persistLocalOptions || {},
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
            // eslint-disable-next-line prefer-const
            let { adjustData, fieldTransforms } = config;

            value = adjustLoadData(value, { adjustData, fieldTransforms }, true);

            if (isPromise(value)) {
                value = await value;
            }

            batch(
                () => {
                    // isLoadingLocal prevents saving remotely when two different persistences
                    // are set on the same observable
                    internal.globalState.isLoadingLocal = true;
                    // We want to merge the local data on top of any initial state the object is created with
                    mergeIntoObservable(obs, value);
                },
                () => {
                    internal.globalState.isLoadingLocal = false;
                },
            );
        }

        obsState.peek().clearLocal = () =>
            Promise.all([
                persistenceLocal.deleteTable(table, config),
                persistenceLocal.deleteMetadata(table, config),
            ]) as unknown as Promise<void>;
    }
    obsState.isLoadedLocal.set(true);
}

export function persistObservable<T, TState = {}>(
    obs: ObservableWriteable<T>,
    persistOptions: PersistOptions<T, TState>,
): ObservableObject<ObservablePersistState & TState> {
    // Merge remote persist options with clobal options
    if (persistOptions.remote) {
        persistOptions.remote = Object.assign(
            {},
            observablePersistConfiguration.persistRemoteOptions,
            persistOptions.remote,
        );
    }
    let { remote } = persistOptions as { remote: PersistOptionsRemote<T> };
    const { local } = persistOptions;
    const remotePersistence = persistOptions.persistRemote! || observablePersistConfiguration?.persistRemote;
    const localState: LocalState = {};

    const obsState = observable<ObservablePersistState>({
        isLoadedLocal: false,
        isLoadedRemote: false,
        isEnabledLocal: true,
        isEnabledRemote: true,
        clearLocal: undefined as unknown as () => Promise<void>,
        sync: () => Promise.resolve(),
        getPendingChanges: () => localState.pendingChanges,
    });

    if (local) {
        loadLocal(obs, persistOptions, obsState, localState);
    }

    if (remote || remotePersistence) {
        if (!remotePersistence) {
            throw new Error('Remote persistence is not configured');
        }
        if (!remote) {
            remote = {};
        }
        if (isObject(remotePersistence)) {
            localState.persistenceRemote = observablePersistRemoteFunctionsAdapter(
                remotePersistence as ObservablePersistRemoteFunctions<T, TState>,
            );
        } else {
            // Ensure there's only one instance of the persistence plugin
            if (!mapPersistences.has(remotePersistence)) {
                mapPersistences.set(remotePersistence, {
                    persist: new (remotePersistence as ClassConstructor<ObservablePersistRemoteClass, any[]>)(),
                });
            }
            localState.persistenceRemote = mapPersistences.get(remotePersistence)!
                .persist as ObservablePersistRemoteClass;
        }

        let isSynced = false;
        const sync = async () => {
            if (!isSynced) {
                isSynced = true;
                const dateModified = metadatas.get(obs)?.modified;
                localState.persistenceRemote!.get({
                    state: obsState,
                    obs,
                    options: persistOptions,
                    dateModified,
                    onLoad: () => {
                        obsState.isLoadedRemote.set(true);
                    },
                    onChange: async ({ value, path = [], pathTypes = [], mode = 'set', dateModified }) => {
                        // Note: value is the constructed value, path is used for setInObservableAtPath
                        // to start the set into the observable from the path
                        if (value !== undefined) {
                            value = adjustLoadData(value, remote, true);
                            if (isPromise(value)) {
                                value = await (value as Promise<T>);
                            }

                            const invertedMap = remote.fieldTransforms && invertFieldMap(remote.fieldTransforms);

                            if (path.length && invertedMap) {
                                path = transformPath(path as string[], pathTypes, invertedMap);
                            }

                            if (mode === 'dateModified') {
                                if (dateModified && !isEmpty(value as unknown as object)) {
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

                                        if ((value as any)[p[0]] !== undefined) {
                                            (value as any) = setAtPath(
                                                value as any,
                                                p,
                                                t,
                                                v,
                                                obs.peek(),
                                                (path: string[], value: any) => {
                                                    delete pending[key];
                                                    pending[path.join('/')] = {
                                                        p: null,
                                                        v: value,
                                                        t: t.slice(0, path.length),
                                                    };
                                                },
                                            );
                                        }
                                    });
                                }

                                onChangeRemote(() => {
                                    setInObservableAtPath(obs, path as string[], value, mode);
                                });
                            }
                        }
                        if (dateModified && local) {
                            updateMetadata(obs, localState, obsState, persistOptions, {
                                modified: dateModified,
                            });
                        }
                    },
                });

                // Wait for remote to be ready before saving pending
                await when(
                    () => obsState.isLoadedRemote.get() || (remote.allowSaveIfError && obsState.remoteError.get()),
                );

                const pending = localState.pendingChanges;
                if (pending && !isEmpty(pending)) {
                    localState.isApplyingPending = true;
                    const keys = Object.keys(pending);

                    // Bundle up all the changes from pending
                    const changes: Change[] = [];
                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        const path = key.split('/').filter((p) => p !== '');
                        const { p, v, t } = pending[key];
                        changes.push({ path, valueAtPath: v, prevAtPath: p, pathTypes: t });
                    }

                    // Send the changes into onObsChange so that they get persisted remotely
                    onObsChange(obs as Observable, obsState, localState, persistOptions, {
                        value: obs.peek(),
                        // TODO getPrevious if any remote persistence layers need it
                        getPrevious: () => undefined,
                        changes,
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

    when(!local || obsState.isLoadedLocal, function (this: any) {
        obs.onChange(
            onObsChange.bind(this, obs as Observable<any>, obsState, localState, persistOptions as PersistOptions),
        );
    });

    return obsState as any;
}
