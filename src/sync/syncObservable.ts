import type {
    Change,
    ClassConstructor,
    GetMode,
    ListenerParams,
    NodeInfo,
    Observable,
    ObservableObject,
    ObservableParam,
    ObservableSyncState,
    TypeAtPath,
    UpdateFnParams,
    UpdateSetFnParams,
} from '@legendapp/state';
import {
    ObservableHint,
    beginBatch,
    constructObjectWithPath,
    endBatch,
    internal,
    isArray,
    isEmpty,
    isFunction,
    isNullOrUndefined,
    isObject,
    isPlainObject,
    isPromise,
    isString,
    mergeIntoObservable,
    observable,
    setAtPath,
    shouldIgnoreUnobserved,
    syncState,
    trackSelector,
    when,
    whenReady,
} from '@legendapp/state';
import { observableSyncConfiguration } from './configureObservableSync';
import { runWithRetry } from './retry';
import { deepEqual, removeNullUndefined } from './syncHelpers';
import type {
    ObservablePersistPlugin,
    OnErrorRetryParams,
    PendingChanges,
    PersistMetadata,
    PersistOptions,
    SyncTransform,
    SyncTransformMethod,
    Synced,
    SyncedErrorParams,
    SyncedGetParams,
    SyncedOptions,
    SyncedSetParams,
    SyncedSubscribeParams,
} from './syncTypes';
import { waitForSet } from './waitForSet';
import { createRevertChanges } from './revertChanges';

const { clone, deepMerge, getNode, getNodeValue, getValueAtPath, globalState, symbolLinked, createPreviousHandler } =
    internal;

export const mapSyncPlugins: WeakMap<
    ClassConstructor<ObservablePersistPlugin> | ObservablePersistPlugin,
    {
        plugin: ObservablePersistPlugin;
        initialized: Observable<boolean>;
    }
> = new WeakMap();

const allSyncStates = new Map<Observable<ObservableSyncState>, NodeInfo>();
const metadatas = new WeakMap<ObservableParam<any>, PersistMetadata>();
const promisesLocalSaves = new Set<Promise<void>>();

interface LocalState {
    pluginPersist?: ObservablePersistPlugin;
    pendingChanges?: PendingChanges;
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

function parseLocalConfig(config: string | PersistOptions): {
    table: string;
    config: PersistOptions;
} {
    return config
        ? isString(config)
            ? { table: config, config: { name: config } }
            : { table: config.name!, config }
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
    const { table, config } = parseLocalConfig(syncOptions.persist!);

    // Save metadata
    const oldMetadata: PersistMetadata | undefined = metadatas.get(value$);

    const { lastSync } = newMetadata!;

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
    metadatas.set(value$, { ...(metadatas.get(value$) || {}), ...newMetadata });
    localState.timeoutSaveMetadata = setTimeout(() => {
        updateMetadataImmediate(value$, localState, syncState, syncOptions as SyncedOptions<T>, metadatas.get(value$)!);
    }, 0);
}

interface QueuedChange<T = any> {
    inRemoteChange: boolean;
    isApplyingPending: boolean;
    value$: Observable<T>;
    syncState: ObservableObject<ObservableSyncState>;
    localState: LocalState;
    syncOptions: SyncedOptions<T>;
    changes: ListenerParams['changes'];
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
            let found = false;
            for (let u = 0; u < change.path.length; u++) {
                const path = change.path.slice(0, u).join('/');
                if (changesByPath.has(path)) {
                    const remaining = change.path.slice(u);
                    setAtPath(
                        changesByPath.get(path)!.valueAtPath,
                        remaining,
                        change.pathTypes.slice(u),
                        change.valueAtPath,
                    );
                    found = true;
                    break;
                }
            }
            if (!found) {
                changesByPath.set(pathStr, change);
                changesOut.push(change);
            }
        }
    }
    return changesOut;
}

function mergeQueuedChanges(allChanges: QueuedChange[]) {
    const changesByOptionsRemote = new Map<SyncedOptions, Change[]>();
    const changesByOptionsLocal = new Map<SyncedOptions, Change[]>();
    const outRemote: Map<SyncedOptions, QueuedChange> = new Map();
    const outLocal: Map<SyncedOptions, QueuedChange> = new Map();

    for (let i = 0; i < allChanges.length; i++) {
        const value = allChanges[i];
        const { changes, inRemoteChange, syncOptions } = value;
        const targetMap = inRemoteChange ? outRemote : outLocal;
        const changesMap = inRemoteChange ? changesByOptionsRemote : changesByOptionsLocal;
        const existing = changesMap.get(syncOptions);
        const newChanges = existing ? [...existing, ...changes] : changes;
        const merged = mergeChanges(newChanges);
        changesMap.set(syncOptions, merged);
        value.changes = merged;
        targetMap.set(syncOptions, value);
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
    // 7. Lastly, update metadata to clear pending. Doing this earlier could potentially cause
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

    const persist = syncOptions.persist!;
    const { config: configLocal } = parseLocalConfig(persist);
    const saveLocal = persist?.name && !configLocal.readonly && !isApplyingPending && syncState.isPersistEnabled.peek();
    const saveRemote = !!(!inRemoteChange && syncOptions?.set && syncState.isSyncEnabled.peek());

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
    } = queuedChange;

    const persist = syncOptions.persist;
    const { config: configLocal } = parseLocalConfig(persist!);
    const saveLocal = persist && !configLocal.readonly && !isApplyingPending && syncState.isPersistEnabled.peek();
    const saveRemote = !inRemoteChange && syncOptions?.set && syncState.isSyncEnabled.peek();

    if (saveLocal || saveRemote) {
        if (saveLocal && !syncState.isPersistLoaded.peek()) {
            console.error(
                '[legend-state] WARNING: An observable was changed before being loaded from persist',
                persist,
            );
            return undefined;
        }
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

                if (saveRemote) {
                    const promiseTransformRemote = transformSaveData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        syncOptions || {},
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
    const { value$: obs$, syncState, localState, syncOptions } = queuedChange;
    const { pluginPersist } = localState;
    const node = getNode(obs$);
    const state$ = node.state!;

    const persist = syncOptions.persist;
    const { table, config: configLocal } = parseLocalConfig(persist!);
    const { onBeforeSet, waitForSet: waitForSetParam, onAfterSet } = syncOptions || ({} as SyncedOptions);
    const shouldSaveMetadata = persist?.retrySync;
    const saveLocal = !!persist?.name;

    if (changesRemote.length > 0) {
        // Wait for remote to be ready before saving
        if (!syncState.isLoaded.peek()) {
            await when(syncState.isLoaded);

            // If this was not already loaded that means that the value was set before it was loaded from remote
            // so we need to adjust the changes to have the remote value as the previous value so that any sync
            // plugins can compare the new value to the remote value, like crud's detection of create/update
            const pending = localState.pendingChanges;
            if (pending) {
                changesRemote.forEach((change) => {
                    const key = change.pathStr;
                    const pendingAtPath = pending[key];
                    if (!isNullOrUndefined(pendingAtPath)) {
                        const { p } = pendingAtPath;
                        change.prevAtPath = p;
                    }
                });
            }
        }

        if (waitForSetParam) {
            await waitForSet(waitForSetParam, changesRemote, obs$.peek());
        }

        // Clone value to ensure it doesn't change observable value
        let value = clone(obs$.peek());
        const transformSave = syncOptions?.transform?.save;
        if (transformSave) {
            value = transformSave(value);
        }

        state$.numPendingSets.set((v) => (v || 0) + 1);
        state$.isSetting.set(true);

        const beforeSetParams: Parameters<Required<SyncedOptions<any>>['onBeforeSet']>[0] = {
            cancel: false,
        };

        onBeforeSet?.(beforeSetParams);

        if (!beforeSetParams.cancel) {
            let updateResult: UpdateSetFnParams | undefined = undefined;

            let lastErrorHandled: Error | undefined;

            const onSetError = (error: Error, params?: SyncedErrorParams, noThrow?: boolean) => {
                if (lastErrorHandled !== error) {
                    if (!params) {
                        params = {
                            setParams: setParams as SyncedSetParams<any>,
                            source: 'set',
                            type: 'set',
                            input: value,
                            retry: setParams,
                            revert: createRevertChanges(setParams.value$, setParams.changes),
                        };
                    }
                    state$.error.set(error);
                    syncOptions.onError?.(error, params!);
                    lastErrorHandled = error;
                    if (!noThrow) {
                        throw error;
                    }
                }
            };

            const setParams: SyncedSetParams<any> = {
                node,
                value$: obs$,
                changes: changesRemote,
                value,
                onError: onSetError,
                update: (params: UpdateSetFnParams<any>) => {
                    if (updateResult) {
                        const { value, mode, changes } = params;
                        updateResult = {
                            value: deepMerge(updateResult.value, value),
                            mode: mode,
                            changes: changes ? [...(updateResult.changes || []), ...changes] : updateResult.changes,
                        };
                    } else {
                        updateResult = params;
                    }
                },
                refresh: syncState.sync,
                retryNum: 0,
                cancelRetry: false,
            };

            const savedPromise = runWithRetry(setParams, syncOptions.retry, node, async () => {
                return syncOptions!.set!(setParams);
            });
            let didError = false;

            if (isPromise(savedPromise)) {
                await savedPromise.catch((error) => {
                    didError = true;
                    if (!syncOptions.retry) {
                        onSetError(error, undefined, true);
                    }
                });
            }

            // If the plugin set which changes saved successfully then use those.
            // Or if it didn't error then use all the changes
            if (!didError || (updateResult as unknown as UpdateSetFnParams)?.changes) {
                // If this remote save changed anything then update cache and metadata
                // Because save happens after a timeout and they're batched together, some calls to save will
                // return saved data and others won't, so those can be ignored.
                const { value: updateValue, changes: updateChanges = changesRemote } = updateResult! || {};
                const pathStrs = Array.from(
                    new Set((updateChanges as ChangeWithPathStr[]).map((change) => change.pathStr)),
                );
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
                    }

                    // Remote can optionally have data that needs to be merged back into the observable,
                    // for example Firebase may update dateModified with the server timestamp
                    if (updateValue && !isEmpty(updateValue)) {
                        transformedChanges = transformLoadData(updateValue, syncOptions, false, 'set');
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
}

function onObsChange<T>(
    value$: ObservableParam<T>,
    syncState: ObservableObject<ObservableSyncState>,
    localState: LocalState,
    syncOptions: SyncedOptions<T>,
    { changes, isFromPersist, isFromSync, getPrevious }: ListenerParams,
) {
    if (!isFromPersist) {
        const inRemoteChange = isFromSync;
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
    syncState$: ObservableObject<ObservableSyncState>,
    localState: LocalState,
) {
    const { persist } = syncOptions;
    const node = getNode(value$);
    const nodeValue = getNodeValue(getNode(node.state!)) as ObservableSyncState;
    const syncStateValue = syncState$.peek();

    const prevResetPersistence = nodeValue.resetPersistence;

    if (persist?.name) {
        const PersistPlugin: ClassConstructor<ObservablePersistPlugin> | ObservablePersistPlugin =
            persist.plugin! || observableSyncConfiguration.persist?.plugin;
        const { table, config } = parseLocalConfig(persist);

        syncStateValue.numPendingLocalLoads = (syncStateValue.numPendingLocalLoads || 0) + 1;

        if (!PersistPlugin) {
            throw new Error('Local persist is not configured');
        }
        // Ensure there's only one instance of the cache plugin
        if (!mapSyncPlugins.has(PersistPlugin)) {
            const persistPlugin = isFunction(PersistPlugin) ? new PersistPlugin() : PersistPlugin;
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
            try {
                const promise = persistPlugin.loadTable(table, config);
                if (promise) {
                    await promise;
                }
            } catch (err) {
                if (process.env.NODE_ENV === 'development') {
                    console.error(
                        '[legend-state] Error loading local cache. This would be a crashing error in production.',
                        err,
                    );
                } else {
                    throw err;
                }
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
            syncState$.assign({
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
            node.root.isLoadingLocal = true;
            internal.globalState.isLoadingLocal = true;

            // We want to merge the local data on top of any initial state the object is created with
            if (value === null && (!prevValue || (prevValue as any)[symbolLinked])) {
                value$.set(value);
            } else {
                mergeIntoObservable(value$, value);
            }
            node.root.isLoadingLocal = false;

            internal.globalState.isLoadingLocal = false;
        }

        syncStateValue.numPendingLocalLoads--;

        nodeValue.resetPersistence = () =>
            Promise.all(
                [
                    prevResetPersistence,
                    persistPlugin.deleteTable(table, config),
                    persistPlugin.deleteMetadata(table, config),
                ].filter(Boolean),
            ) as unknown as Promise<void>;
    } else {
        nodeValue.resetPersistence = () => prevResetPersistence?.();
    }
    // TODOV3 Remove
    nodeValue.clearPersist = nodeValue.resetPersistence;

    syncState$.isPersistLoaded.set(!(syncStateValue.numPendingLocalLoads! > 0));
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

    const syncState$ = syncState(obs$);
    const syncStateValue = getNodeValue(getNode(syncState$)) as ObservableSyncState;
    allSyncStates.set(syncState$, node);
    syncStateValue.getPendingChanges = () => localState.pendingChanges;

    let lastErrorHandled: Error | undefined;
    const onGetError = (error: Error, params: SyncedErrorParams, noThrow?: boolean) => {
        if (lastErrorHandled !== error) {
            if (!params) {
                params = {
                    source: 'get',
                    type: 'get',
                    retry: params,
                };
            }
            syncState$.error.set(error);
            syncOptions.onError?.(error, params);
            lastErrorHandled = error;
            if (!noThrow) {
                throw error;
            }
        }
    };

    loadLocal(obs$, syncOptions, syncState$, localState);

    let isWaitingForLoad = !!syncOptions.get;
    if (isWaitingForLoad) {
        syncStateValue.numPendingRemoteLoads = (syncStateValue.numPendingRemoteLoads || 0) + 1;
    }
    // This node may already be loading from a previous syncObservable call so only set it to loaded
    // if not already loading and nothing to load here
    syncState$.isLoaded.set(!syncState$.numPendingRemoteLoads.peek());

    let isSynced = false;
    let isSubscribed = false;
    let isApplyingPendingAfterSync = false;
    let unsubscribe: void | (() => void) = undefined;

    const applyPending = (pending: PendingChanges | undefined) => {
        if (pending && !isEmpty(pending)) {
            const keys = Object.keys(pending);
            const value = getNodeValue(node);

            // Bundle up all the changes from pending
            const changes: Change[] = [];
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const path = key.split('/').filter((p) => p !== '');
                const { p, t, v } = pending[key];
                const valueAtPath = getValueAtPath(value, path);
                if (isApplyingPendingAfterSync || !deepEqual(valueAtPath, v)) {
                    changes.push({ path, valueAtPath: v, prevAtPath: p, pathTypes: t });
                }
            }

            if (changes.length > 0) {
                localState.isApplyingPending = true;
                // Send the changes into onObsChange so that they get synced remotely
                onObsChange(obs$, syncState$, localState, syncOptions, {
                    value,
                    isFromPersist: false,
                    isFromSync: false,
                    getPrevious: createPreviousHandler(value, changes),
                    changes,
                });
                localState.isApplyingPending = false;
            }
        }
    };

    const { get, subscribe } = syncOptions;

    if (get || subscribe) {
        sync = async () => {
            // If this node is not being observed or sync is not enabled then don't sync
            if (isSynced && (!getNodeValue(getNode(syncState$)).isSyncEnabled || shouldIgnoreUnobserved(node, sync))) {
                if (unsubscribe) {
                    isSubscribed = false;
                    unsubscribe();
                    unsubscribe = undefined;
                }
                return;
            }
            const lastSync = metadatas.get(obs$)?.lastSync;
            const pending = localState.pendingChanges;

            if (get || subscribe) {
                const { waitFor } = syncOptions;

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
                                // Merge pending values onto remote changes
                                Object.keys(pending).forEach((key) => {
                                    const p = key.split('/').filter((k) => k !== '');
                                    const { v, t } = pending[key];

                                    if (t.length === 0 || !value) {
                                        // Update pending previous value with result
                                        const oldValue = clone(value);
                                        pending[key].p = key ? oldValue[key] : oldValue;

                                        if (isObject(value) && isObject(v)) {
                                            Object.assign(value, key ? { [key]: v } : v);
                                        } else if (!key) {
                                            value = v;
                                        }
                                    } else if ((value as any)[p[0]] !== undefined) {
                                        const curValue = getValueAtPath(currentValue as object, p);
                                        const newValue = getValueAtPath(value as object, p);
                                        if (JSON.stringify(curValue) === JSON.stringify(newValue)) {
                                            delete pending[key];
                                            didChangeMetadata = true;
                                        } else {
                                            // Update pending previous value with result
                                            const oldValue = clone(value);
                                            pending[key].p = getValueAtPath(oldValue, p);

                                            didChangeMetadata = true;
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

                                if (didChangeMetadata && syncOptions.persist) {
                                    updateMetadataImmediate(obs$, localState, syncState$, syncOptions, {
                                        pending,
                                    });
                                }
                            }

                            onChangeRemote(() => {
                                if (isPlainObject(value)) {
                                    value = ObservableHint.plain(value);
                                }
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
                        const subscribe = syncOptions.subscribe;
                        isSubscribed = true;
                        const doSubscribe = () => {
                            const subscribeParams: SyncedSubscribeParams<T> = {
                                node,
                                value$: obs$,
                                lastSync,
                                update: (params: UpdateFnParams) => {
                                    when(
                                        () => !get || syncState$.isLoaded.get(),
                                        () => {
                                            when(waitFor || true, () => {
                                                params.mode ||= syncOptions.mode || 'merge';
                                                onChange(params);

                                                // If no get then we need to set the loaded state
                                                if (!syncState$.isLoaded.peek()) {
                                                    syncState$.assign({
                                                        isLoaded: syncStateValue.numPendingRemoteLoads! < 1,
                                                        error: undefined,
                                                        isGetting: syncStateValue.numPendingGets! > 0,
                                                    });
                                                }
                                            });
                                        },
                                    );
                                },
                                refresh: () => when(syncState$.isLoaded, sync),
                                onError: (error: Error) =>
                                    onGetError(error, {
                                        source: 'subscribe',
                                        subscribeParams,
                                        type: 'get',
                                        retry: {} as OnErrorRetryParams,
                                    }),
                            };
                            unsubscribe = subscribe(subscribeParams);
                        };

                        if (waitFor) {
                            whenReady(waitFor, doSubscribe);
                        } else {
                            doSubscribe();
                        }
                    }
                    const existingValue = getNodeValue(node);

                    if (get) {
                        const getParams: SyncedGetParams<T> = {
                            node,
                            value$: obs$,
                            value:
                                isFunction(existingValue) || existingValue?.[symbolLinked] ? undefined : existingValue,
                            mode: syncOptions.mode!,
                            refresh: sync,
                            options: syncOptions,
                            lastSync,
                            updateLastSync: (lastSync: number) => (getParams.lastSync = lastSync),
                            onError: onGetError,
                            retryNum: 0,
                            cancelRetry: false,
                        };

                        let modeBeforeReset: GetMode | undefined = undefined;

                        const beforeGetParams: Parameters<Required<SyncedOptions<any>>['onBeforeGet']>[0] = {
                            value: getParams.value,
                            lastSync,
                            pendingChanges: pending && !isEmpty(pending) ? pending : undefined,
                            clearPendingChanges: async () => {
                                localState.pendingChanges = {};
                                await updateMetadataImmediate(obs$, localState, syncState$, syncOptions, {
                                    pending: localState.pendingChanges,
                                });
                            },
                            resetCache: () => {
                                modeBeforeReset = getParams.mode;
                                getParams.mode = 'set';
                                return syncStateValue.resetPersistence?.();
                            },
                            cancel: false,
                        };

                        syncOptions.onBeforeGet?.(beforeGetParams);

                        if (!beforeGetParams.cancel) {
                            syncState$.assign({
                                numPendingGets: (syncStateValue.numPendingGets! || 0) + 1,
                                isGetting: true,
                            });
                            const got = runWithRetry(getParams, syncOptions.retry, node, (retryEvent) => {
                                const params = getParams as SyncedGetParams<T>;
                                params.cancelRetry = retryEvent.cancelRetry;
                                params.retryNum = retryEvent.retryNum;
                                return get(params);
                            });
                            const numGets = (node.numGets = (node.numGets || 0) + 1);
                            const handle = (value: any) => {
                                syncState$.numPendingGets.set((v) => v! - 1);
                                if (isWaitingForLoad) {
                                    isWaitingForLoad = false;
                                    syncStateValue.numPendingRemoteLoads!--;
                                }
                                // If this is from an older Promise than one that resolved already,
                                // ignore it as the newer one wins
                                if (numGets >= (node.getNumResolved || 0)) {
                                    node.getNumResolved = node.numGets;

                                    onChange({
                                        value,
                                        lastSync: getParams.lastSync,
                                        mode: getParams.mode!,
                                    });
                                }

                                if (modeBeforeReset) {
                                    getParams.mode = modeBeforeReset;
                                    modeBeforeReset = undefined;
                                }

                                syncState$.assign({
                                    isLoaded: syncStateValue.numPendingRemoteLoads! < 1,
                                    error: undefined,
                                    isGetting: syncStateValue.numPendingGets! > 0,
                                });
                            };
                            if (isPromise(got)) {
                                got.then(handle).catch((error) => {
                                    onGetError(
                                        error,
                                        { getParams, source: 'get', type: 'get', retry: getParams },
                                        true,
                                    );
                                });
                            } else {
                                handle(got);
                            }
                        }
                    }
                };

                if (waitFor) {
                    whenReady(waitFor, () => trackSelector(runGet, sync));
                } else {
                    trackSelector(runGet, sync);
                }
            } else {
                syncState$.assign({
                    isLoaded: true,
                    error: undefined,
                });
            }
            if (!isSynced) {
                isSynced = true;
                isApplyingPendingAfterSync = true;

                applyPending(pending);

                isApplyingPendingAfterSync = false;
            }
        };

        syncStateValue.sync = sync;
    } else {
        if (!isSynced) {
            isApplyingPendingAfterSync = true;
            applyPending(localState.pendingChanges);
            isApplyingPendingAfterSync = false;
        }
    }

    syncStateValue.reset = async () => {
        // Reset all the state back to initial and clear persistence
        const wasPersistEnabled = syncStateValue.isPersistEnabled;
        const wasSyncEnabled = syncStateValue.isSyncEnabled;
        const metadata = metadatas.get(obs$);
        if (metadata) {
            Object.assign(metadata, { lastSync: undefined, pending: undefined } as PersistMetadata);
        }
        Object.assign(syncStateValue, {
            isPersistEnabled: false,
            isSyncEnabled: false,
            lastSync: undefined,
            numPendingGets: 0,
            isLoaded: false,
            isGetting: false,
            isSetting: false,
            numPendingSets: 0,
            syncCount: 0,
        } as ObservableSyncState);
        isSynced = false;
        isSubscribed = false;
        unsubscribe?.();
        unsubscribe = undefined;
        const promise = syncStateValue.resetPersistence();
        onChangeRemote(() => {
            obs$.set(syncOptions.initial ?? undefined);
        });
        syncState$.isLoaded.set(false);
        syncStateValue.isPersistEnabled = wasPersistEnabled;
        syncStateValue.isSyncEnabled = wasSyncEnabled;
        node.dirtyFn = sync;
        await promise;
    };

    // Wait for this node and all parent nodes up the hierarchy to be loaded
    const onAllPersistLoaded = () => {
        let parentNode: NodeInfo | undefined = node;
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
        if ((syncOptions.get || syncOptions.subscribe) && syncOptions.syncMode === 'auto') {
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

export function getAllSyncStates(): readonly [Observable<ObservableSyncState>, NodeInfo][] {
    return Array.from(allSyncStates.entries());
}
