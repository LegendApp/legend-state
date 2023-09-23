import {
    batch,
    constructObjectWithPath,
    deconstructObjectWithPath,
    internal,
    isEmpty,
    isFunction,
    isObject,
    isObservable,
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
import { Observable, ListenerParams } from 'src/observableInterfaces2';
import {
    ClassConstructor,
    ObservablePersistLocal,
    ObservablePersistRemoteClass,
    PersistMetadata,
    PersistOptionsLocal,
    PersistTransform,
    FieldTransforms,
    ObservablePersistState,
    PersistOptions,
    PersistOptionsRemote,
    ObservablePersistRemoteFunctions,
} from './types';

export const mapPersistences: WeakMap<
    ClassConstructor<ObservablePersistLocal | ObservablePersistRemoteClass>,
    {
        persist: ObservablePersistLocal | ObservablePersistRemoteClass;
        initialized?: Observable<boolean>;
    }
> = new WeakMap();

export const persistState = observable({ inRemoteSync: false });
const metadatas = new WeakMap<Observable<any>, PersistMetadata>();
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

export function transformOutData(
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    { transform, fieldTransforms }: { transform?: PersistTransform; fieldTransforms?: FieldTransforms<any> },
): { value: any; path: string[] } | Promise<{ value: any; path: string[] }> {
    if (fieldTransforms || transform?.out) {
        const transformFn = () => {
            if (fieldTransforms) {
                const { obj, path: pathTransformed } = transformObjectWithPath(value, path, pathTypes, fieldTransforms);
                value = obj;
                path = pathTransformed;
            }

            return { value, path };
        };

        if (transform?.out) {
            const constructed = constructObjectWithPath(path, value, pathTypes);
            const saved = transform.out(constructed);
            const deconstruct = (toDeconstruct: boolean) => {
                value = deconstructObjectWithPath(path, toDeconstruct);
                return transformFn();
            };
            return doInOrder(saved, deconstruct);
        }
        return transformFn();
    }

    return { value, path };
}

export function transformLoadData(
    value: any,
    { transform, fieldTransforms }: { fieldTransforms?: FieldTransforms<any>; transform?: PersistTransform },
    doUserTransform: boolean,
): Promise<any> | any {
    if (fieldTransforms) {
        const inverted = invertFieldMap(fieldTransforms);
        value = transformObject(value, inverted);
    }

    if (doUserTransform && transform?.in) {
        value = transform.in(value);
    }

    return value;
}

async function updateMetadataImmediate<T, TState = {}>(
    obs: Observable<any>,
    localState: LocalState<TState>,
    syncState: Observable<ObservablePersistState>,
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
            syncState.dateModified.set(modified);
        }
    }
}

function updateMetadata<T, TState = {}>(
    obs: Observable<any>,
    localState: LocalState<TState>,
    syncState: Observable<ObservablePersistState>,
    persistOptions: PersistOptions<T, TState>,
    newMetadata: PersistMetadata,
) {
    if (localState.timeoutSaveMetadata) {
        clearTimeout(localState.timeoutSaveMetadata);
    }
    localState.timeoutSaveMetadata = setTimeout(
        () =>
            updateMetadataImmediate(obs, localState, syncState, persistOptions as PersistOptions<T, any>, newMetadata),
        30,
    );
}

interface QueuedChange<T = any, TState = any> {
    inRemoteChange: boolean;
    isApplyingPending: boolean;
    obs: Observable<T>;
    syncState: Observable<ObservablePersistState>;
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
    // 1. Prepare all changes for saving. This may involve waiting for promises if the user has asynchronous transform.
    // We need to prepare all of the changes in the queue before saving so that the saves happen in the correct order,
    // since some may take longer to transformSaveData than others.
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
    const { syncState, changes, localState, persistOptions, inRemoteChange, isApplyingPending } = queuedChange;

    const local = persistOptions.local;
    const { persistenceRemote } = localState;
    const { config: configLocal } = parseLocalConfig(local!);
    const configRemote = persistOptions.remote;
    const saveLocal = local && !configLocal.readonly && !isApplyingPending && syncState.isEnabledLocal.peek();
    const saveRemote =
        !inRemoteChange && persistenceRemote && !configRemote?.readonly && syncState.isEnabledRemote.peek();

    if (saveLocal || saveRemote) {
        if (saveLocal && !syncState.isLoadedLocal.peek()) {
            console.error(
                '[legend-state] WARNING: An observable was changed before being loaded from persistence',
                local,
            );
            return;
        }
        const changesLocal: ChangeWithPathStr[] = [];
        const changesRemote: ChangeWithPathStr[] = [];
        const changesPaths = new Set<string>();
        let promisesTransform: (void | Promise<any>)[] = [];

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
                    const promiseTransformLocal = transformOutData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        configLocal,
                    );

                    promisesTransform.push(
                        doInOrder(promiseTransformLocal, ({ path: pathTransformed, value: valueTransformed }) => {
                            // If path includes undefined there was a null in fieldTransforms so don't need to save it
                            if (!pathTransformed.includes(undefined as unknown as string)) {
                                // Prepare the local change with the transformed path/value
                                changesLocal.push({
                                    path: pathTransformed,
                                    pathTypes,
                                    prevAtPath,
                                    valueAtPath: valueTransformed,
                                    pathStr,
                                });
                            }
                        }),
                    );
                }

                if (saveRemote) {
                    const promiseTransformRemote = transformOutData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        configRemote || {},
                    );

                    promisesTransform.push(
                        doInOrder(promiseTransformRemote, ({ path: pathTransformed, value: valueTransformed }) => {
                            // If path includes undefined there was a null in fieldTransforms so don't need to save it
                            if (!pathTransformed.includes(undefined as unknown as string)) {
                                // Prepare pending changes
                                if (!localState.pendingChanges) {
                                    localState.pendingChanges = {};
                                }
                                // The "p" saved in pending should be the previous state before changes,
                                // so don't overwrite it if it already exists
                                if (!localState.pendingChanges[pathStr]) {
                                    localState.pendingChanges[pathStr] = { p: prevAtPath ?? null, t: pathTypes };
                                }

                                // Pending value is the untransformed value because it gets loaded without transformment
                                // and forwarded through to onObsChange where it gets transformed before save
                                localState.pendingChanges[pathStr].v = valueAtPath;

                                // Prepare the remote change with the transformed path/value
                                changesRemote.push({
                                    path: pathTransformed,
                                    pathTypes,
                                    prevAtPath,
                                    valueAtPath: valueTransformed,
                                    pathStr,
                                });
                            }
                        }),
                    );
                }
            }
        }

        // If there's any transform promises, wait for them before saving
        promisesTransform = promisesTransform.filter(Boolean);
        if (promisesTransform.length > 0) {
            await Promise.all(promisesTransform);
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
    const { obs, syncState, localState, persistOptions } = queuedChange;
    const { persistenceLocal, persistenceRemote } = localState;

    const local = persistOptions.local;
    const { table, config: configLocal } = parseLocalConfig(local!);
    const configRemote = persistOptions.remote;
    const shouldSaveMetadata = local && configRemote?.offlineBehavior === 'retry';

    if (changesRemote.length > 0 && shouldSaveMetadata) {
        // First save pending changes before saving local or remote
        await updateMetadataImmediate(obs, localState, syncState, persistOptions, {
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
            () => syncState.isLoadedRemote.get() || (configRemote?.allowSetIfError && syncState.remoteError.get()),
        );

        const value = obs.peek();

        configRemote?.onBeforeSet?.();

        const saved = await persistenceRemote!.set!({
            obs,
            syncState: syncState,
            options: persistOptions,
            changes: changesRemote,
            value,
        }).catch((err) => configRemote?.onSetError?.(err));

        // If this remote save changed anything then update persistence and metadata
        // Because save happens after a timeout and they're batched together, some calls to save will
        // return saved data and others won't, so those can be ignored.
        if (saved) {
            const pathStrs = Array.from(new Set(changesRemote.map((change) => change.pathStr)));
            const { changes, dateModified } = saved;
            if (pathStrs.length > 0) {
                if (local) {
                    const metadata: PersistMetadata = {};
                    const pending = persistenceLocal!.getMetadata(table, configLocal)?.pending;
                    let transformedChanges: any[] = [];

                    for (let i = 0; i < pathStrs.length; i++) {
                        const pathStr = pathStrs[i];
                        // Clear pending for this path
                        if (pending?.[pathStr]) {
                            // Remove pending from local state
                            delete pending[pathStr];
                            metadata.pending = pending;
                        }
                    }

                    if (dateModified) {
                        metadata.modified = dateModified;
                    }

                    // Remote can optionally have data that needs to be merged back into the observable,
                    // for example Firebase may update dateModified with the server timestamp
                    if (changes && !isEmpty(changes)) {
                        transformedChanges.push(transformLoadData(changes, persistOptions.remote!, false));
                    }

                    if (transformedChanges.length > 0) {
                        if (transformedChanges.some((change) => isPromise(change))) {
                            transformedChanges = await Promise.all(transformedChanges);
                        }
                        onChangeRemote(() => mergeIntoObservable(obs, ...transformedChanges));
                    }

                    if (shouldSaveMetadata && !isEmpty(metadata)) {
                        updateMetadata(obs, localState, syncState, persistOptions, metadata);
                    }
                }
                configRemote?.onSet?.();
            }
        }
    }
}

function onObsChange<T, TState = {}>(
    obs: Observable<T>,
    syncState: Observable<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T, TState>,
    { changes }: ListenerParams,
) {
    if (!internal.globalState.isLoadingLocal) {
        const inRemoteChange = internal.globalState.isLoadingRemote;
        const isApplyingPending = localState.isApplyingPending;
        // Queue changes in a microtask so that multiple changes within a frame get run together
        _queuedChanges.push({
            obs: obs,
            syncState,
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
    obs: Observable<T>,
    persistOptions: PersistOptions<any, any>,
    syncState: Observable<ObservablePersistState>,
    localState: LocalState,
) {
    const { local } = persistOptions;
    const localPersistence: ClassConstructor<ObservablePersistLocal> =
        persistOptions.pluginLocal! || observablePersistConfiguration.pluginLocal;

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
                    observablePersistConfiguration.localOptions || {},
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
            syncState.dateModified.set(metadata.modified);
        }

        // Merge the data from local persistence into the default state
        if (value !== null && value !== undefined) {
            const { transform, fieldTransforms } = config;

            value = transformLoadData(value, { transform, fieldTransforms }, true);

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

        syncState.peek().clearLocal = () =>
            Promise.all([
                persistenceLocal.deleteTable(table, config),
                persistenceLocal.deleteMetadata(table, config),
            ]) as unknown as Promise<void>;
    }
    syncState.isLoadedLocal.set(true);
}

export function persistObservable<T, TState = {}>(
    observable: Observable<T>,
    persistOptions: PersistOptions<T, TState>,
): [Observable<T>, Observable<ObservablePersistState & TState>];
export function persistObservable<T, TState = {}>(
    initial: T | (() => T) | (() => Promise<T>),
    persistOptions: PersistOptions<T, TState>,
): [Observable<T>, Observable<ObservablePersistState & TState>];
export function persistObservable<T, TState = {}>(
    initialOrObservable: Observable<T> | T | (() => T) | (() => Promise<T>),
    persistOptions: PersistOptions<T, TState>,
): [Observable<T>, Observable<ObservablePersistState & TState>] {
    const obs = (
        isObservable(initialOrObservable)
            ? initialOrObservable
            : observable(isFunction(initialOrObservable) ? initialOrObservable() : initialOrObservable)
    ) as Observable<T>;

    // Merge remote persist options with clobal options
    if (persistOptions.remote) {
        persistOptions.remote = Object.assign({}, observablePersistConfiguration.remoteOptions, persistOptions.remote);
    }
    let { remote } = persistOptions as { remote: PersistOptionsRemote<T> };
    const { local } = persistOptions;
    const remotePersistence = persistOptions.pluginRemote! || observablePersistConfiguration?.pluginRemote;
    const localState: LocalState = {};

    const syncState = observable<ObservablePersistState>({
        isLoadedLocal: false,
        isLoadedRemote: false,
        isEnabledLocal: true,
        isEnabledRemote: true,
        clearLocal: undefined as unknown as () => Promise<void>,
        sync: () => Promise.resolve(),
        getPendingChanges: () => localState.pendingChanges,
    });

    if (local) {
        loadLocal(obs, persistOptions, syncState, localState);
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
                    state: syncState,
                    obs,
                    options: persistOptions as PersistOptions<T, any>,
                    dateModified,
                    onGet: () => {
                        syncState.isLoadedRemote.set(true);
                    },
                    onChange: async ({ value, path = [], pathTypes = [], mode = 'set', dateModified }) => {
                        // Note: value is the constructed value, path is used for setInObservableAtPath
                        // to start the set into the observable from the path
                        if (value !== undefined) {
                            value = transformLoadData(value, remote, true);
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
                                                obs.peek() as object | undefined,
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
                            updateMetadata(obs, localState, syncState, persistOptions as PersistOptions<T, any>, {
                                modified: dateModified,
                            });
                        }
                    },
                });

                // Wait for remote to be ready before saving pending
                await when(
                    () => syncState.isLoadedRemote.get() || (remote.allowSetIfError && syncState.remoteError.get()),
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
                    onObsChange(obs, syncState, localState, persistOptions, {
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
            syncState.assign({ sync });
        } else {
            when(() => !local || syncState.isLoadedLocal.get(), sync);
        }
    }

    when(!local || syncState.isLoadedLocal, function (this: any) {
        obs.onChange(onObsChange.bind(this, obs, syncState, localState, persistOptions as PersistOptions<any, any>));
    });

    return [obs, syncState as any];
}
