import type {
    Change,
    ClassConstructor,
    GetMode,
    ListenerParams,
    NodeValue,
    Observable,
    ObservableObject,
    ObservableParam,
    ObservableSyncState,
    TypeAtPath,
    UpdateFnParams,
} from '@legendapp/state';
import {
    beginBatch,
    constructObjectWithPath,
    endBatch,
    hasOwnProperty,
    internal,
    isArray,
    isEmpty,
    isFunction,
    isObject,
    isObservable,
    isPromise,
    isString,
    mergeIntoObservable,
    observable,
    setAtPath,
    shouldIgnoreUnobserved,
    syncState,
    when,
    whenReady,
} from '@legendapp/state';
import { observableSyncConfiguration } from './configureObservableSync';
import { removeNullUndefined } from './syncHelpers';
import type {
    ObservablePersistPlugin,
    PersistMetadata,
    PersistOptions,
    SyncTransform,
    SyncTransformMethod,
    Synced,
    SyncedGetParams,
    SyncedOptions,
    SyncedSetParams,
} from './syncTypes';

const { clone, getNode, getNodeValue, getValueAtPath, globalState, runWithRetry, symbolLinked, createPreviousHandler } =
    internal;

export const mapSyncPlugins: WeakMap<
    ClassConstructor<ObservablePersistPlugin>,
    {
        plugin: ObservablePersistPlugin;
        initialized: Observable<boolean>;
    }
> = new WeakMap();

const allSyncStates = new Map<Observable<ObservableSyncState>, NodeValue>();
const metadatas = new WeakMap<ObservableParam<any>, PersistMetadata>();
const promisesLocalSaves = new Set<Promise<void>>();

interface LocalState {
    pluginPersist?: ObservablePersistPlugin;
    pendingChanges?: Record<string, { p: any; v?: any; t: TypeAtPath[] }>;
    isApplyingPending?: boolean;
    timeoutSaveMetadata?: any;
}

interface PreppedChangeLocal {
    queuedChange: QueuedChange;
    changesLocal: ChangeWithPathStr[];
    saveRemote: boolean;
}

interface PreppedChangeRemote {
    queuedChange: QueuedChange;
    changesRemote: ChangeWithPathStr[];
}

type ChangeWithPathStr = Change & { pathStr: string };
type ChangeWithPathStrAndPrevious = ChangeWithPathStr & { valuePrevious: any };

function parseLocalConfig(config: string | PersistOptions | undefined): {
    table: string;
    config: PersistOptions;
} {
    return config
        ? isString(config)
            ? { table: config, config: { name: config } }
            : { table: config.name, config }
        : ({} as { table: string; config: PersistOptions });
}

function doInOrder<T>(arg1: T | Promise<T>, arg2: (value: T) => void): any {
    return isPromise(arg1) ? arg1.then(arg2) : arg2(arg1);
}

export function onChangeRemote(cb: () => void) {
    endBatch(true);
    // Remote changes should only update local state
    globalState.isLoadingRemote = true;

    beginBatch();
    cb();
    // Reset isLoadingRemote before ending the batch so it doesn't
    // apply to any side effects
    globalState.isLoadingRemote = false;
    endBatch(true);
}

export async function transformSaveData(
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    { transform }: { transform?: SyncTransform },
): Promise<{ value: any; path: any }> {
    if (transform?.save) {
        const constructed = constructObjectWithPath(path, pathTypes, value);
        const saved = await transform.save(constructed);
        value = saved;
        const outPath = [];
        for (let i = 0; i < path.length; i++) {
            outPath[i] = Object.keys(value)[0];
            value = value[outPath[i]];
        }
        path = outPath;
    }

    return { value, path };
}

export function transformLoadData(
    value: any,
    { transform }: { transform?: SyncTransform },
    doUserTransform: boolean,
    method: SyncTransformMethod,
): Promise<any> | any {
    if (doUserTransform && transform?.load) {
        value = transform.load(value, method);
    }

    return value;
}

async function updateMetadataImmediate<T>(
    value$: ObservableParam<any>,
    localState: LocalState,
    syncState: Observable<ObservableSyncState>,
    syncOptions: SyncedOptions<T>,
    newMetadata: PersistMetadata,
) {
    const saves = Array.from(promisesLocalSaves);
    if (saves.length > 0) {
        await Promise.all(saves);
    }

    const { pluginPersist } = localState;
    const { table, config } = parseLocalConfig(syncOptions?.persist);

    // Save metadata
    const oldMetadata: PersistMetadata | undefined = metadatas.get(value$);

    const { lastSync } = newMetadata;

    const metadata = Object.assign({}, oldMetadata, newMetadata);
    metadatas.set(value$, metadata);
    if (pluginPersist) {
        await pluginPersist!.setMetadata(table, metadata, config);
    }

    if (lastSync) {
        syncState.assign({
            lastSync: lastSync,
        });
    }
}

function updateMetadata<T>(
    value$: ObservableParam<any>,
    localState: LocalState,
    syncState: ObservableObject<ObservableSyncState>,
    syncOptions: SyncedOptions<T>,
    newMetadata: PersistMetadata,
) {
    if (localState.timeoutSaveMetadata) {
        clearTimeout(localState.timeoutSaveMetadata);
    }
    localState.timeoutSaveMetadata = setTimeout(
        () => updateMetadataImmediate(value$, localState, syncState, syncOptions as SyncedOptions<T>, newMetadata),
        0,
    );
}

interface QueuedChange<T = any> {
    inRemoteChange: boolean;
    isApplyingPending: boolean;
    value$: Observable<T>;
    syncState: ObservableObject<ObservableSyncState>;
    localState: LocalState;
    syncOptions: SyncedOptions<T>;
    changes: ListenerParams['changes'];
    valuePrevious?: T;
    getPrevious: () => T;
}

let _queuedChanges: QueuedChange[] = [];
const _queuedRemoteChanges: Map<SyncedOptions, QueuedChange[]> = new Map();
const _queuedRemoteChangesTimeouts: Map<SyncedOptions, number> = new Map();

function mergeChanges(changes: Change[]) {
    const changesByPath = new Map<string, Change>();
    const changesOut: Change[] = [];
    // TODO: This could be even more robust by going deeper into paths like the firebase plugin's _updatePendingSave
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const pathStr = change.path.join('/');
        const existing = changesByPath.get(pathStr);
        if (existing) {
            // If setting a value back to what it was, no need to save it
            if (change.valueAtPath === existing.prevAtPath) {
                changesOut.splice(changesOut.indexOf(change), 1);
            } else {
                existing.valueAtPath = change.valueAtPath;
            }
        } else {
            changesByPath.set(pathStr, change);
            changesOut.push(change);
        }
    }
    return changesOut;
}

function mergeQueuedChanges(allChanges: QueuedChange[]) {
    const changesByObsRemote = new Map<Observable, Change[]>();
    const changesByObsLocal = new Map<Observable, Change[]>();
    const previousByObs = new Map<Observable, any>();
    const outRemote: Map<Observable, QueuedChange> = new Map();
    const outLocal: Map<Observable, QueuedChange> = new Map();

    for (let i = 0; i < allChanges.length; i++) {
        const value = allChanges[i];
        const { value$: obs, changes, inRemoteChange, getPrevious } = value;
        const targetMap = inRemoteChange ? outRemote : outLocal;
        const changesMap = inRemoteChange ? changesByObsRemote : changesByObsLocal;
        const existing = changesMap.get(obs);
        const newChanges = existing ? [...existing, ...changes] : changes;
        const merged = mergeChanges(newChanges);
        changesMap.set(obs, merged);
        value.changes = merged;
        if (!previousByObs.has(obs)) {
            previousByObs.set(obs, getPrevious());
        }
        value.valuePrevious = previousByObs.get(obs);
        targetMap.set(obs, value);
    }
    return Array.from(outRemote.values()).concat(Array.from(outLocal.values()));
}

async function processQueuedChanges() {
    // Get a local copy of the queued changes and clear the global queue
    const queuedChanges = mergeQueuedChanges(_queuedChanges);
    _queuedChanges = [];

    const pendingSyncOptions = new Set<SyncedOptions>();
    for (let i = 0; i < queuedChanges.length; i++) {
        const change = queuedChanges[i];
        if (!change.inRemoteChange) {
            if (!_queuedRemoteChanges.has(change.syncOptions)) {
                _queuedRemoteChanges.set(change.syncOptions, []);
            }
            pendingSyncOptions.add(change.syncOptions);
            _queuedRemoteChanges.get(change.syncOptions)!.push(change);
        }
    }

    // Note: Summary of the order of operations these functions:
    // 1. Prepare all changes for saving. This may involve waiting for promises if the user has asynchronous transform.
    // We need to prepare all of the changes in the queue before saving so that the saves happen in the correct order,
    // since some may take longer to transformSaveData than others.
    // 2. Save pending to the metadata table first. If this is the only operation that succeeds, it would try to save
    // the current value again on next load, which isn't too bad.
    // 3. Save local changes to storage. If they never make it to remote, then on the next load they will be pending
    // and attempted again.
    // 4. Wait for remote load or error if allowed
    // 5. Save to remote
    // 6. On successful save, merge changes (if any) back into observable
    // 7. Lastly, update metadata to clear pending and update lastSync. Doing this earlier could potentially cause
    // sync inconsistences so it's very important that this is last.

    const preppedChangesLocal = await Promise.all(queuedChanges.map(prepChangeLocal));

    // TODO Clean this up: We only need to prep this now in order to save pending changes, don't need any of the other stuff. Should split that up?
    await Promise.all(queuedChanges.map(prepChangeRemote));

    await Promise.all(preppedChangesLocal.map(doChangeLocal));

    for (const options of pendingSyncOptions) {
        const timeout = options.debounceSet ?? observableSyncConfiguration?.debounceSet;
        const timeoutSaveRemote = _queuedRemoteChangesTimeouts.get(options);
        const run = () => processQueuedRemoteChanges(options);
        if (timeout) {
            if (timeoutSaveRemote) {
                clearTimeout(timeoutSaveRemote);
            }

            _queuedRemoteChangesTimeouts.set(options, setTimeout(run, timeout) as any);
        } else {
            run();
        }
    }
}

async function processQueuedRemoteChanges(syncOptions: SyncedOptions) {
    const arr = _queuedRemoteChanges.get(syncOptions);
    if (arr?.length) {
        const queuedRemoteChanges = mergeQueuedChanges(arr);
        _queuedRemoteChanges.set(syncOptions, []);

        const preppedChangesRemote = await Promise.all(queuedRemoteChanges.map(prepChangeRemote));

        preppedChangesRemote.forEach(doChangeRemote);
    }
}

async function prepChangeLocal(queuedChange: QueuedChange): Promise<PreppedChangeLocal | undefined> {
    const { syncState, changes, syncOptions, inRemoteChange, isApplyingPending } = queuedChange;

    const persist = syncOptions.persist;
    const { config: configLocal } = parseLocalConfig(persist);
    const configRemote = syncOptions;
    const saveLocal = persist?.name && !configLocal.readonly && !isApplyingPending && syncState.isPersistEnabled.peek();
    const saveRemote = !!(
        !inRemoteChange &&
        syncOptions?.set &&
        configRemote?.enableSync !== false &&
        syncState.isSyncEnabled.peek()
    );

    if (saveLocal || saveRemote) {
        if (saveLocal && !syncState.isPersistLoaded.peek()) {
            console.error(
                '[legend-state] WARNING: An observable was changed before being loaded from persist',
                persist,
            );
            return undefined;
        }
        const changesLocal: ChangeWithPathStr[] = [];
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
                    const promiseTransformLocal = transformSaveData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        configLocal,
                    );

                    promisesTransform.push(
                        doInOrder(promiseTransformLocal, ({ value: valueTransformed, path: pathTransformed }) => {
                            // Prepare the local change with the transformed path/value
                            changesLocal.push({
                                path: pathTransformed,
                                pathTypes,
                                prevAtPath,
                                valueAtPath: valueTransformed,
                                pathStr: path === pathTransformed ? pathStr : pathTransformed.join('/'),
                            });
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

        return { queuedChange, changesLocal, saveRemote };
    }
}
async function prepChangeRemote(queuedChange: QueuedChange): Promise<PreppedChangeRemote | undefined> {
    const {
        syncState,
        changes,
        localState,
        syncOptions: syncOptions,
        inRemoteChange,
        isApplyingPending,
        valuePrevious,
    } = queuedChange;

    const persist = syncOptions.persist;
    const { config: configLocal } = parseLocalConfig(persist!);
    const configRemote = syncOptions;
    const saveLocal = persist && !configLocal.readonly && !isApplyingPending && syncState.isPersistEnabled.peek();
    const saveRemote =
        !inRemoteChange && syncOptions?.set && configRemote?.enableSync !== false && syncState.isSyncEnabled.peek();

    if (saveLocal || saveRemote) {
        if (saveLocal && !syncState.isPersistLoaded.peek()) {
            console.error(
                '[legend-state] WARNING: An observable was changed before being loaded from persist',
                persist,
            );
            return undefined;
        }
        const changesRemote: ChangeWithPathStrAndPrevious[] = [];
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

                if (saveRemote) {
                    const promiseTransformRemote = transformSaveData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        configRemote || {},
                    );

                    promisesTransform.push(
                        doInOrder(promiseTransformRemote, ({ value: valueTransformed, path: pathTransformed }) => {
                            // Prepare pending changes
                            if (!localState.pendingChanges) {
                                localState.pendingChanges = {};
                            }

                            // First look for existing pending changes at a higher level than this change
                            // If they exist then merge this change into it
                            let found = false;
                            for (let i = 0; !found && i < pathTransformed.length - 1; i++) {
                                const pathParent = pathTransformed.slice(0, i + 1).join('/');
                                if (localState.pendingChanges[pathParent]?.v) {
                                    found = true;
                                    const pathChild = pathTransformed.slice(i + 1);
                                    const pathTypesChild = pathTypes.slice(i + 1);
                                    setAtPath(
                                        localState.pendingChanges[pathParent].v,
                                        pathChild,
                                        pathTypesChild,
                                        valueAtPath,
                                    );
                                }
                            }
                            if (!found) {
                                // If an existing pending change is deeper than this change, just delete it
                                // in favor of this wider change
                                for (const key in localState.pendingChanges) {
                                    if (key !== pathStr && key.startsWith(pathStr)) {
                                        delete localState.pendingChanges[key];
                                    }
                                }
                                // The "p" saved in pending should be the previous state before changes,
                                // so don't overwrite it if it already exists
                                if (!localState.pendingChanges[pathStr]) {
                                    localState.pendingChanges[pathStr] = { p: prevAtPath ?? null, t: pathTypes };
                                }

                                // Pending value is the untransformed value because it gets loaded without transformment
                                // and forwarded through to onObsChange where it gets transformed before save
                                localState.pendingChanges[pathStr].v = valueAtPath;
                            }

                            // Prepare the remote change with the transformed path/value
                            changesRemote.push({
                                path: pathTransformed,
                                pathTypes,
                                prevAtPath,
                                valueAtPath: valueTransformed,
                                pathStr,
                                valuePrevious,
                            });
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

        return { queuedChange, changesRemote };
    }
}

async function doChangeLocal(changeInfo: PreppedChangeLocal | undefined) {
    if (!changeInfo) return;

    const { queuedChange, changesLocal, saveRemote } = changeInfo;
    const { value$: obs, syncState, localState, syncOptions: syncOptions } = queuedChange;
    const { pluginPersist } = localState;

    const persist = syncOptions.persist;
    const saveLocal = !!persist?.name;

    if (saveLocal) {
        const { table, config: configLocal } = parseLocalConfig(persist!);
        const shouldSaveMetadata = persist?.retrySync;

        if (saveRemote && shouldSaveMetadata) {
            // First save pending changes before saving local or remote
            await updateMetadataImmediate(obs, localState, syncState, syncOptions, {
                pending: localState.pendingChanges,
            });
        }

        if (changesLocal.length > 0) {
            // Save the changes to local cache before saving to remote. They are already marked as pending so
            // if remote sync fails or the app is closed before remote sync, it will attempt to sync them on the next load.
            let promiseSet = pluginPersist!.set(table, changesLocal, configLocal);

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
    }
}
async function doChangeRemote(changeInfo: PreppedChangeRemote | undefined) {
    if (!changeInfo) return;

    const { queuedChange, changesRemote } = changeInfo;
    const { value$: obs$, syncState, localState, syncOptions, valuePrevious: previous } = queuedChange;
    const { pluginPersist } = localState;
    const node = getNode(obs$);
    const state$ = node.state!;

    const persist = syncOptions.persist;
    const { table, config: configLocal } = parseLocalConfig(persist!);
    const { onBeforeSet, waitForSet, onAfterSet } = syncOptions || ({} as SyncedOptions);
    const shouldSaveMetadata = persist?.retrySync;
    const saveLocal = !!persist?.name;

    if (changesRemote.length > 0) {
        // Wait for remote to be ready before saving
        await when(syncState.isLoaded);

        if (waitForSet) {
            const waitFn = isFunction(waitForSet)
                ? waitForSet({ changes: changesRemote, value: obs$.peek() })
                : waitForSet;
            if (waitFn) {
                await when(waitFn);
            }
        }

        // Clone value to ensure it doesn't change observable value
        let value = clone(obs$.peek());
        const transformSave = syncOptions?.transform?.save;
        if (transformSave) {
            value = transformSave(value);
        }

        state$.numPendingSets.set((v) => (v || 0) + 1);
        state$.isSetting.set(true);

        onBeforeSet?.();

        let updateResult:
            | {
                  value?: any;
                  mode?: GetMode;
                  lastSync?: number | undefined;
              }
            | undefined = undefined;

        const onError = (error: Error) => {
            state$.error.set(error);
            syncOptions.onSetError?.(error, setParams as SyncedSetParams<any>);
        };

        const setParams: Omit<SyncedSetParams<any>, 'cancelRetry' | 'retryNum'> = {
            node,
            changes: changesRemote,
            value,
            valuePrevious: previous,
            onError,
            update: (params: UpdateFnParams) => {
                if (updateResult) {
                    const { value, lastSync, mode } = params;
                    updateResult = {
                        lastSync: Math.max(updateResult.lastSync || 0, lastSync || 0),
                        value: mergeIntoObservable(updateResult.value, value),
                        mode: mode,
                    };
                } else {
                    updateResult = params;
                }
            },
            refresh: syncState.sync,
        };

        let savedPromise = runWithRetry({ retryNum: 0, retry: syncOptions.retry }, async (retryEvent) => {
            const params = setParams as SyncedSetParams<any>;
            params.cancelRetry = retryEvent.cancelRetry;
            params.retryNum = retryEvent.retryNum;

            return syncOptions!.set!(params);
        });
        if (isPromise(savedPromise)) {
            savedPromise = savedPromise.catch(onError);
        }

        await savedPromise;

        if (!state$.error.peek()) {
            // If this remote save changed anything then update cache and metadata
            // Because save happens after a timeout and they're batched together, some calls to save will
            // return saved data and others won't, so those can be ignored.
            const pathStrs = Array.from(new Set(changesRemote.map((change) => change.pathStr)));
            const { value: changes, lastSync } = updateResult! || {};
            if (pathStrs.length > 0) {
                let transformedChanges: object | undefined = undefined;
                const metadata: PersistMetadata = {};
                if (saveLocal) {
                    const pendingMetadata = pluginPersist!.getMetadata(table, configLocal)?.pending;
                    const pending = localState.pendingChanges;

                    for (let i = 0; i < pathStrs.length; i++) {
                        const pathStr = pathStrs[i];
                        // Clear pending for this path
                        if (pendingMetadata?.[pathStr]) {
                            // Remove pending from persisted medata state
                            delete pendingMetadata[pathStr];
                            metadata.pending = pendingMetadata;
                        }
                        // Clear pending for this path if not already removed by above
                        // pendingMetadata === pending sometimes
                        if (pending?.[pathStr]) {
                            // Remove pending from local state
                            delete pending[pathStr];
                        }
                    }

                    if (lastSync) {
                        metadata.lastSync = lastSync;
                    }
                }

                // Remote can optionally have data that needs to be merged back into the observable,
                // for example Firebase may update dateModified with the server timestamp
                if (changes && !isEmpty(changes)) {
                    transformedChanges = transformLoadData(changes, syncOptions, false, 'set');
                }

                if (transformedChanges !== undefined) {
                    if (isPromise(transformedChanges)) {
                        transformedChanges = (await transformedChanges) as object;
                    }
                    onChangeRemote(() => mergeIntoObservable(obs$, transformedChanges));
                }

                if (saveLocal) {
                    if (shouldSaveMetadata && !isEmpty(metadata)) {
                        updateMetadata(obs$, localState, syncState, syncOptions, metadata);
                    }
                }
            }

            state$.numPendingSets.set((v) => v! - 1);
            state$.isSetting.set(state$.numPendingSets.peek()! > 0);

            onAfterSet?.();
        }
    }
}

function onObsChange<T>(
    value$: ObservableParam<T>,
    syncState: ObservableObject<ObservableSyncState>,
    localState: LocalState,
    syncOptions: SyncedOptions<T>,
    { changes, loading, remote, getPrevious }: ListenerParams,
) {
    if (!loading) {
        const inRemoteChange = remote;
        const isApplyingPending = localState.isApplyingPending;
        // Queue changes in a microtask so that multiple changes within a frame get run together
        _queuedChanges.push({
            value$: value$ as Observable<any>,
            syncState,
            localState,
            syncOptions,
            changes,
            inRemoteChange,
            isApplyingPending: isApplyingPending!,
            getPrevious,
        });
        if (_queuedChanges.length === 1) {
            queueMicrotask(processQueuedChanges);
        }
    }
}

async function loadLocal<T>(
    value$: ObservableParam<T>,
    syncOptions: SyncedOptions<any>,
    syncState: ObservableObject<ObservableSyncState>,
    localState: LocalState,
) {
    const { persist } = syncOptions;
    const node = getNode(value$);
    const nodeValue = getNodeValue(getNode(node.state!));

    if (persist?.name) {
        const PersistPlugin: ClassConstructor<ObservablePersistPlugin> =
            persist.plugin! || observableSyncConfiguration.persist?.plugin;
        const { table, config } = parseLocalConfig(persist);

        if (!PersistPlugin) {
            throw new Error('Local persist is not configured');
        }
        // Ensure there's only one instance of the cache plugin
        if (!mapSyncPlugins.has(PersistPlugin)) {
            const persistPlugin = new PersistPlugin();
            const mapValue = { plugin: persistPlugin, initialized: observable(false) };
            mapSyncPlugins.set(PersistPlugin, mapValue);
            if (persistPlugin.initialize) {
                const initializePromise = persistPlugin.initialize?.(observableSyncConfiguration?.persist || {});
                if (isPromise(initializePromise)) {
                    await initializePromise;
                }
            }
            mapValue.initialized.set(true);
        }

        const { plugin, initialized: initialized$ } = mapSyncPlugins.get(PersistPlugin)!;
        const persistPlugin = plugin as ObservablePersistPlugin;

        localState.pluginPersist = persistPlugin as ObservablePersistPlugin;

        if (!initialized$.peek()) {
            await when(initialized$);
        }

        // If cache has an asynchronous load, wait for it
        if (persistPlugin.loadTable) {
            const promise = persistPlugin.loadTable(table, config);
            if (promise) {
                await promise;
            }
        }

        // Get current value for init
        const prevValue = getNodeValue(node) as object;

        // Get the value from state
        let value = persistPlugin.getTable(table, prevValue, config);
        const metadata = persistPlugin.getMetadata(table, config);

        if (metadata) {
            metadatas.set(value$, metadata);
            localState.pendingChanges = metadata.pending;
            syncState.assign({
                lastSync: metadata.lastSync,
            });
        }

        // Merge the data from local cache into the default state
        if (value !== undefined) {
            const { transform } = config;

            value = transformLoadData(value, { transform }, true, 'get');

            if (isPromise(value)) {
                value = await value;
            }

            // isLoadingLocal prevents saving remotely when two different caches
            // are set on the same observable
            internal.globalState.isLoadingLocal = true;

            // We want to merge the local data on top of any initial state the object is created with
            if (value === null && (!prevValue || (prevValue as any)[symbolLinked])) {
                value$.set(value);
            } else {
                mergeIntoObservable(value$, value);
            }

            internal.globalState.isLoadingLocal = false;
        }

        nodeValue.clearPersist = () =>
            Promise.all([
                persistPlugin.deleteTable(table, config),
                persistPlugin.deleteMetadata(table, config),
            ]) as unknown as Promise<void>;
    } else {
        nodeValue.clearPersist = () => {};
    }
    syncState.isPersistLoaded.set(true);
}

function deepMerge<T extends object>(target: T, ...sources: any[]): T {
    const result: T = { ...target } as T;

    for (let i = 0; i < sources.length; i++) {
        const obj2 = sources[i];
        for (const key in obj2) {
            if (hasOwnProperty.call(obj2, key)) {
                if (obj2[key] instanceof Object && !isObservable(obj2[key]) && Object.keys(obj2[key]).length > 0) {
                    (result as any)[key] = deepMerge(
                        (result as any)[key] || (isArray((obj2 as any)[key]) ? [] : {}),
                        (obj2 as any)[key],
                    );
                } else {
                    (result as any)[key] = obj2[key];
                }
            }
        }
    }

    return result;
}

export function syncObservable<T>(
    obs$: ObservableParam<T>,
    syncOptions: SyncedOptions<T>,
): Observable<ObservableSyncState>;
export function syncObservable<T>(obs$: ObservableParam<T>, syncOptions: Synced<T>): Observable<ObservableSyncState>;
export function syncObservable<T>(
    obs$: ObservableParam<T>,
    syncOptionsOrSynced: SyncedOptions<T> | Synced<T>,
): Observable<ObservableSyncState> {
    let syncOptions = syncOptionsOrSynced as SyncedOptions<T>;
    // If it's a synced then get the SyncOptions from it
    if (isFunction(syncOptions)) {
        syncOptions = syncOptions()[symbolLinked];
    }
    const node = getNode(obs$);

    if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && (!obs$ || !node)) {
        throw new Error('[legend-state] syncObservable called with undefined observable');
    }
    // Merge remote sync options with global options
    syncOptions = deepMerge(
        {
            syncMode: 'auto',
        },
        observableSyncConfiguration,
        removeNullUndefined(syncOptions || {}),
    );
    const localState: LocalState = {};
    let sync: () => Promise<void>;
    let numOutstandingGets = 0;

    const syncState$ = syncState(obs$);
    allSyncStates.set(syncState$, node);
    syncState$.assign({
        isLoaded: !syncOptions.get,
        getPendingChanges: () => localState.pendingChanges,
    });

    const onError = (error: Error, getParams: SyncedGetParams | undefined, source: 'get' | 'subscribe') => {
        node.state!.error.set(error);
        syncOptions.onGetError?.(error, getParams, source);
    };

    loadLocal(obs$, syncOptions, syncState$, localState);

    if (syncOptions.get) {
        let isSynced = false;
        let isSubscribed = false;
        let unsubscribe: void | (() => void) = undefined;
        sync = async () => {
            if (isSynced && shouldIgnoreUnobserved(node, sync)) {
                if (unsubscribe) {
                    isSubscribed = false;
                    unsubscribe();
                    unsubscribe = undefined;
                }
                return;
            }
            const lastSync = metadatas.get(obs$)?.lastSync;
            const pending = localState.pendingChanges;
            const get = syncOptions.get;

            if (get) {
                const runGet = () => {
                    const onChange = async ({ value, mode, lastSync }: UpdateFnParams) => {
                        mode = mode || syncOptions.mode || 'set';
                        if (value !== undefined) {
                            value = transformLoadData(value, syncOptions, true, 'get');
                            if (isPromise(value)) {
                                value = await (value as Promise<T>);
                            }

                            const pending = localState.pendingChanges;
                            const currentValue = obs$.peek();
                            if (pending) {
                                let didChangeMetadata = false;
                                Object.keys(pending).forEach((key) => {
                                    const p = key.split('/').filter((p) => p !== '');
                                    const { v, t } = pending[key];

                                    if (t.length === 0 || !value) {
                                        if (isObject(value) && isObject(v)) {
                                            Object.assign(value, v);
                                        } else {
                                            value = v;
                                        }
                                    } else if ((value as any)[p[0]] !== undefined) {
                                        const curValue = getValueAtPath(currentValue as object, p);
                                        const newValue = getValueAtPath(value as object, p);
                                        if (JSON.stringify(curValue) === JSON.stringify(newValue)) {
                                            delete pending[key];
                                            didChangeMetadata = true;
                                        } else {
                                            (value as any) = setAtPath(
                                                value as any,
                                                p,
                                                t,
                                                v,
                                                'merge',
                                                obs$.peek(),
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
                                    }
                                });

                                if (didChangeMetadata) {
                                    updateMetadata(obs$, localState, syncState$, syncOptions, {
                                        pending,
                                    });
                                }
                            }

                            onChangeRemote(() => {
                                if (mode === 'assign') {
                                    (obs$ as unknown as Observable<object>).assign(value);
                                } else if (mode === 'append') {
                                    if (
                                        (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
                                        !isArray(value)
                                    ) {
                                        console.error('[legend-state] mode:append expects the value to be an array');
                                    }
                                    (obs$ as unknown as Observable<any[]>).push(...value);
                                } else if (mode === 'prepend') {
                                    if (
                                        (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
                                        !isArray(value)
                                    ) {
                                        console.error('[legend-state] mode:prepend expects the value to be an array');
                                    }
                                    (obs$ as unknown as Observable<any[]>).splice(0, 0, ...value);
                                } else if (mode === 'merge') {
                                    mergeIntoObservable(obs$, value);
                                } else {
                                    obs$.set(value);
                                }
                            });
                        }
                        if (lastSync && syncOptions.persist) {
                            updateMetadata(obs$, localState, syncState$, syncOptions, {
                                lastSync,
                            });
                        }
                    };
                    if (node.activationState) {
                        node.activationState!.onChange = onChange;
                    }
                    // Subscribe before getting to ensure we don't miss updates between now and the get returning
                    if (!isSubscribed && syncOptions.subscribe) {
                        isSubscribed = true;
                        unsubscribe = syncOptions.subscribe({
                            node,
                            value$: obs$,
                            lastSync,
                            update: (params: UpdateFnParams) => {
                                when(node.state!.isLoaded, () => {
                                    when(waitFor || true, () => {
                                        params.mode ||= syncOptions.mode || 'merge';
                                        onChange(params);
                                    });
                                });
                            },
                            refresh: () => when(node.state!.isLoaded, sync),
                            onError: (error) => onError(error, undefined, 'subscribe'),
                        });
                    }
                    const existingValue = getNodeValue(node);

                    const getParams: Omit<SyncedGetParams, 'cancelRetry' | 'retryNum'> = {
                        value: isFunction(existingValue) || existingValue?.[symbolLinked] ? undefined : existingValue,
                        mode: syncOptions.mode!,
                        refresh: sync,
                        options: syncOptions,
                        lastSync,
                        updateLastSync: (lastSync: number) => (getParams.lastSync = lastSync),
                        onError: (error) => onError(error, getParams as SyncedGetParams, 'get'),
                    };
                    numOutstandingGets++;
                    node.state!.isGetting.set(true);
                    const got = runWithRetry({ retryNum: 0, retry: syncOptions.retry }, (retryEvent) => {
                        const params = getParams as SyncedGetParams;
                        params.cancelRetry = retryEvent.cancelRetry;
                        params.retryNum = retryEvent.retryNum;
                        return get(params);
                    });
                    const handle = (value: any) => {
                        onChange({
                            value,
                            lastSync: getParams.lastSync,
                            mode: getParams.mode!,
                        });
                        numOutstandingGets--;
                        node.state!.assign({
                            isLoaded: true,
                            error: undefined,
                            isGetting: numOutstandingGets > 0,
                        });
                    };
                    if (isPromise(got)) {
                        got.then(handle);
                    } else {
                        handle(got);
                    }
                };

                const { waitFor } = syncOptions;
                if (waitFor) {
                    if (node.activationState) {
                        node.activationState.waitFor = undefined;
                    }
                    whenReady(waitFor, runGet);
                } else {
                    runGet();
                }
            } else {
                node.state!.assign({
                    isLoaded: true,
                    error: undefined,
                });
            }
            if (!isSynced) {
                isSynced = true;
                // Wait for remote to be ready before saving pending
                await when(syncState$.isLoaded);

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

                    // Send the changes into onObsChange so that they get synced remotely
                    const value = getNodeValue(node);
                    onObsChange(obs$, syncState$, localState, syncOptions, {
                        value,
                        loading: false,
                        remote: false,
                        getPrevious: createPreviousHandler(value, changes),
                        changes,
                    });
                    localState.isApplyingPending = false;
                }
            }
        };

        syncState$.assign({ sync });
    }

    // Wait for this node and all parent nodes up the hierarchy to be loaded
    const onAllPersistLoaded = () => {
        let parentNode: NodeValue | undefined = node;
        while (parentNode) {
            if (parentNode.state?.isPersistLoaded?.get() === false) {
                return false;
            }
            parentNode = parentNode.parent;
        }
        return true;
    };
    // When all is loaded locally we can start syncing and listening for changes
    when(onAllPersistLoaded, function (this: any) {
        // If remote is not manual, then sync() is called automatically
        if (syncOptions.get && syncOptions.syncMode === 'auto') {
            sync();
        }

        if (syncOptions?.set || syncOptions?.persist) {
            obs$.onChange(
                onObsChange.bind(this, obs$ as any, syncState$, localState, syncOptions as SyncedOptions<any>),
            );
        }
    });

    return syncState$;
}

export function getAllSyncStates(): readonly [Observable<ObservableSyncState>, NodeValue][] {
    return Array.from(allSyncStates.entries());
}
