import type {
    CacheMetadata,
    CacheOptions,
    Change,
    ClassConstructor,
    ListenerParams,
    NodeValue,
    Observable,
    ObservableCachePlugin,
    ObservableObject,
    ObservableParam,
    ObservableSyncClass,
    ObservableSyncState,
    Primitive,
    SyncTransform,
    SyncedParams,
    TypeAtPath,
} from '@legendapp/state';
import {
    batch,
    constructObjectWithPath,
    endBatch,
    getNode,
    internal,
    isEmpty,
    isFunction,
    isPromise,
    isString,
    mergeIntoObservable,
    observable,
    setAtPath,
    setInObservableAtPath,
    when,
} from '@legendapp/state';
import { syncObservableAdapter } from './syncObservableAdapter';
import { removeNullUndefined } from './syncHelpers';
import { observableSyncConfiguration } from './configureObservableSync';

const { globalState, symbolLinked } = internal;

export const mapSyncPlugins: WeakMap<
    ClassConstructor<ObservableCachePlugin | ObservableSyncClass>,
    {
        plugin: ObservableCachePlugin | ObservableSyncClass;
        initialized: Observable<boolean>;
    }
> = new WeakMap();

const metadatas = new WeakMap<ObservableParam<any>, CacheMetadata>();
const promisesLocalSaves = new Set<Promise<void>>();

interface LocalState {
    pluginCache?: ObservableCachePlugin;
    pluginSync?: ObservableSyncClass;
    pendingChanges?: Record<string, { p: any; v?: any; t: TypeAtPath[] }>;
    numSavesOutstanding?: number;
    pendingSaveResults?: object[];
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

function parseLocalConfig(config: string | CacheOptions | undefined): {
    table: string;
    config: CacheOptions;
} {
    return config
        ? isString(config)
            ? { table: config, config: { name: config } }
            : { table: config.name, config }
        : ({} as { table: string; config: CacheOptions });
}

function doInOrder<T>(arg1: T | Promise<T>, arg2: (value: T) => void): any {
    return isPromise(arg1) ? arg1.then(arg2) : arg2(arg1);
}

export function onChangeRemote(cb: () => void) {
    endBatch(true);
    // Remote changes should only update local state
    globalState.isLoadingRemote = true;

    batch(cb);

    globalState.isLoadingRemote = false;
}

export function transformOutData(
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    { transform }: { transform?: SyncTransform },
): Promise<any> | any {
    if (transform?.save) {
        const constructed = constructObjectWithPath(path, pathTypes, value);
        value = transform.save(constructed);
    }

    return value;
}

export function transformLoadData(
    value: any,
    { transform }: { transform?: SyncTransform },
    doUserTransform: boolean,
): Promise<any> | any {
    if (doUserTransform && transform?.load) {
        value = transform.load(value);
    }

    return value;
}

async function updateMetadataImmediate<T>(
    obs: ObservableParam<any>,
    localState: LocalState,
    syncState: Observable<ObservableSyncState>,
    syncOptions: SyncedParams<T>,
    newMetadata: CacheMetadata,
) {
    const saves = Array.from(promisesLocalSaves);
    if (saves.length > 0) {
        await Promise.all(saves);
    }

    const { pluginCache } = localState;
    const { table, config } = parseLocalConfig(syncOptions?.cache);

    // Save metadata
    const oldMetadata: CacheMetadata | undefined = metadatas.get(obs);

    const { lastSync, pending } = newMetadata;

    const needsUpdate = pending || (lastSync && (!oldMetadata || lastSync !== oldMetadata.lastSync));

    if (needsUpdate) {
        const metadata = Object.assign({}, oldMetadata, newMetadata);
        metadatas.set(obs, metadata);
        if (pluginCache) {
            await pluginCache!.setMetadata(table, metadata, config);
        }

        if (lastSync) {
            syncState.assign({
                lastSync: lastSync,
                dateModified: lastSync,
            });
        }
    }
}

function updateMetadata<T>(
    obs: ObservableParam<any>,
    localState: LocalState,
    syncState: ObservableObject<ObservableSyncState>,
    syncOptions: SyncedParams<T>,
    newMetadata: CacheMetadata,
) {
    if (localState.timeoutSaveMetadata) {
        clearTimeout(localState.timeoutSaveMetadata);
    }
    localState.timeoutSaveMetadata = setTimeout(
        () => updateMetadataImmediate(obs, localState, syncState, syncOptions as SyncedParams<T>, newMetadata),
        0,
    );
}

interface QueuedChange<T = any> {
    inRemoteChange: boolean;
    isApplyingPending: boolean;
    obs: Observable<T>;
    syncState: ObservableObject<ObservableSyncState>;
    localState: LocalState;
    syncOptions: SyncedParams<T>;
    changes: ListenerParams['changes'];
}

let _queuedChanges: QueuedChange[] = [];
let _queuedRemoteChanges: QueuedChange[] = [];
let timeoutSaveRemote: any = undefined;

function mergeChanges(changes: Change[]) {
    const changesByPath = new Map<string, Change>();
    const changesOut: Change[] = [];
    // TODO: This could be even more robust by going deeper into paths like the firebase plugin's _updatePendingSave
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const pathStr = change.path.join('/');
        const existing = changesByPath.get(pathStr);
        if (existing) {
            existing.valueAtPath = change.valueAtPath;
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

    const outRemote: Map<Observable, QueuedChange> = new Map();
    const outLocal: Map<Observable, QueuedChange> = new Map();
    for (let i = 0; i < allChanges.length; i++) {
        const value = allChanges[i];
        const { obs, changes, inRemoteChange } = value;
        const changesMap = inRemoteChange ? changesByObsRemote : changesByObsLocal;
        const existing = changesMap.get(obs);
        const newChanges = existing ? [...existing, ...changes] : changes;
        const merged = mergeChanges(newChanges);
        changesMap.set(obs, merged);
        value.changes = merged;
        (inRemoteChange ? outRemote : outLocal).set(obs, value);
    }
    return Array.from(outRemote.values()).concat(Array.from(outLocal.values()));
}

async function processQueuedChanges() {
    // Get a local copy of the queued changes and clear the global queue
    const queuedChanges = mergeQueuedChanges(_queuedChanges);
    _queuedChanges = [];

    _queuedRemoteChanges.push(...queuedChanges.filter((c) => !c.inRemoteChange));

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

    // TODO Clean this up: We only need to prep this now in ordre to save pending changes, don't need any of the other stuff. Should split that up?
    await Promise.all(queuedChanges.map(prepChangeRemote));

    await Promise.all(preppedChangesLocal.map(doChangeLocal));

    const timeout = observableSyncConfiguration?.debounceSet;
    if (timeout) {
        if (timeoutSaveRemote) {
            clearTimeout(timeoutSaveRemote);
        }

        timeoutSaveRemote = setTimeout(processQueuedRemoteChanges, timeout);
    } else {
        processQueuedRemoteChanges();
    }
}

async function processQueuedRemoteChanges() {
    const queuedRemoteChanges = mergeQueuedChanges(_queuedRemoteChanges);
    _queuedRemoteChanges = [];

    const preppedChangesRemote = await Promise.all(queuedRemoteChanges.map(prepChangeRemote));

    preppedChangesRemote.forEach(doChangeRemote);
}

async function prepChangeLocal(queuedChange: QueuedChange): Promise<PreppedChangeLocal | undefined> {
    const { syncState, changes, localState, syncOptions, inRemoteChange, isApplyingPending } = queuedChange;

    const cache = syncOptions.cache;
    const { pluginSync } = localState;
    const { config: configLocal } = parseLocalConfig(cache);
    const configRemote = syncOptions;
    const saveLocal = cache && !configLocal.readonly && !isApplyingPending && syncState.isEnabledLocal.peek();
    const saveRemote = !!(
        !inRemoteChange &&
        pluginSync?.set &&
        configRemote?.enableSync !== false &&
        syncState.isEnabledRemote.peek()
    );

    if (saveLocal || saveRemote) {
        if (saveLocal && !syncState.isLoadedLocal.peek()) {
            console.error('[legend-state] WARNING: An observable was changed before being loaded from cache', cache);
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
                    const promiseTransformLocal = transformOutData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        configLocal,
                    );

                    promisesTransform.push(
                        doInOrder(promiseTransformLocal, (valueTransformed) => {
                            // Prepare the local change with the transformed path/value
                            changesLocal.push({
                                path,
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

    const cache = syncOptions.cache;
    const { pluginSync } = localState;
    const { config: configLocal } = parseLocalConfig(cache!);
    const configRemote = syncOptions;
    const saveLocal = cache && !configLocal.readonly && !isApplyingPending && syncState.isEnabledLocal.peek();
    const saveRemote =
        !inRemoteChange && pluginSync?.set && configRemote?.enableSync !== false && syncState.isEnabledRemote.peek();

    if (saveLocal || saveRemote) {
        if (saveLocal && !syncState.isLoadedLocal.peek()) {
            console.error('[legend-state] WARNING: An observable was changed before being loaded from cache', cache);
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
                    const promiseTransformRemote = transformOutData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        configRemote || {},
                    );

                    promisesTransform.push(
                        doInOrder(promiseTransformRemote, (valueTransformed) => {
                            // Prepare pending changes
                            if (!localState.pendingChanges) {
                                localState.pendingChanges = {};
                            }

                            // First look for existing pending changes at a higher level than this change
                            // If they exist then merge this change into it
                            let found = false;
                            for (let i = 0; !found && i < path.length - 1; i++) {
                                const pathParent = path.slice(0, i + 1).join('/');
                                if (localState.pendingChanges[pathParent]?.v) {
                                    found = true;
                                    const pathChild = path.slice(i + 1);
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
                                path,
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
    const { obs, syncState, localState, syncOptions: syncOptions } = queuedChange;
    const { pluginCache } = localState;

    const cache = syncOptions.cache;
    const { table, config: configLocal } = parseLocalConfig(cache!);
    const configRemote = syncOptions;
    const shouldSaveMetadata = cache && configRemote?.offlineBehavior === 'retry';

    if (saveRemote && shouldSaveMetadata) {
        // First save pending changes before saving local or remote
        await updateMetadataImmediate(obs, localState, syncState, syncOptions, {
            pending: localState.pendingChanges,
        });
    }

    if (changesLocal.length > 0) {
        // Save the changes to local cache before saving to remote. They are already marked as pending so
        // if remote sync fails or the app is closed before remote sync, it will attempt to sync them on the next load.
        let promiseSet = pluginCache!.set(table, changesLocal, configLocal);

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
async function doChangeRemote(changeInfo: PreppedChangeRemote | undefined) {
    if (!changeInfo) return;

    const { queuedChange, changesRemote } = changeInfo;
    const { obs, syncState, localState, syncOptions: syncOptions } = queuedChange;
    const { pluginCache, pluginSync } = localState;

    const cache = syncOptions.cache;
    const { table, config: configLocal } = parseLocalConfig(cache!);
    const { offlineBehavior, allowSetIfGetError, onBeforeSet, onSetError, waitForSet, onAfterSet } =
        syncOptions || ({} as SyncedParams);
    const shouldSaveMetadata = cache && offlineBehavior === 'retry';

    if (changesRemote.length > 0) {
        // Wait for remote to be ready before saving
        await when(() => syncState.isLoaded.get() || (allowSetIfGetError && syncState.error.get()));

        if (waitForSet) {
            const waitFor = isFunction(waitForSet)
                ? waitForSet({ changes: changesRemote, value: obs.peek() })
                : waitForSet;
            if (waitFor) {
                await when(waitFor);
            }
        }

        const value = obs.peek();

        onBeforeSet?.();

        localState.numSavesOutstanding = (localState.numSavesOutstanding || 0) + 1;

        const saved = await pluginSync!.set!({
            obs,
            syncState: syncState,
            options: syncOptions,
            changes: changesRemote,
            value,
        })?.catch((err) => onSetError?.(err));

        localState.numSavesOutstanding--;

        // If this remote save changed anything then update cache and metadata
        // Because save happens after a timeout and they're batched together, some calls to save will
        // return saved data and others won't, so those can be ignored.
        if (saved) {
            const pathStrs = Array.from(new Set(changesRemote.map((change) => change.pathStr)));
            const { changes, lastSync } = saved;
            if (pathStrs.length > 0) {
                if (cache) {
                    const metadata: CacheMetadata = {};
                    const pending = pluginCache!.getMetadata(table, configLocal)?.pending;
                    let transformedChanges: object | undefined = undefined;

                    for (let i = 0; i < pathStrs.length; i++) {
                        const pathStr = pathStrs[i];
                        // Clear pending for this path
                        if (pending?.[pathStr]) {
                            // Remove pending from local state
                            delete pending[pathStr];
                            metadata.pending = pending;
                        }
                    }

                    if (lastSync) {
                        metadata.lastSync = lastSync;
                    }

                    // Remote can optionally have data that needs to be merged back into the observable,
                    // for example Firebase may update dateModified with the server timestamp
                    if (changes && !isEmpty(changes)) {
                        transformedChanges = transformLoadData(changes, syncOptions, false);
                    }

                    if (localState.numSavesOutstanding > 0) {
                        if (transformedChanges) {
                            if (!localState.pendingSaveResults) {
                                localState.pendingSaveResults = [];
                            }
                            localState.pendingSaveResults.push(transformedChanges);
                        }
                    } else {
                        let allChanges = [...(localState.pendingSaveResults || []), transformedChanges];
                        if (allChanges.length > 0) {
                            if (allChanges.some((change) => isPromise(change))) {
                                allChanges = await Promise.all(allChanges);
                            }
                            onChangeRemote(() => mergeIntoObservable(obs, ...allChanges));
                        }

                        if (shouldSaveMetadata && !isEmpty(metadata)) {
                            updateMetadata(obs, localState, syncState, syncOptions, metadata);
                        }

                        localState.pendingSaveResults = [];
                    }
                }
                onAfterSet?.();
            }
        }
    }
}

function onObsChange<T>(
    obs: Observable<T>,
    syncState: ObservableObject<ObservableSyncState>,
    localState: LocalState,
    syncOptions: SyncedParams<T>,
    { changes, loading, remote }: ListenerParams,
) {
    if (!loading) {
        const inRemoteChange = remote;
        const isApplyingPending = localState.isApplyingPending;
        // Queue changes in a microtask so that multiple changes within a frame get run together
        _queuedChanges.push({
            obs: obs as Observable<any>,
            syncState,
            localState,
            syncOptions,
            changes,
            inRemoteChange,
            isApplyingPending: isApplyingPending!,
        });
        if (_queuedChanges.length === 1) {
            queueMicrotask(processQueuedChanges);
        }
    }
}

async function loadLocal<T>(
    obs: ObservableParam<T>,
    syncOptions: SyncedParams<any>,
    syncState: ObservableObject<ObservableSyncState>,
    localState: LocalState,
) {
    const { cache } = syncOptions;

    if (cache) {
        const CachePlugin: ClassConstructor<ObservableCachePlugin> =
            cache.plugin! || observableSyncConfiguration.cache?.plugin;
        const { table, config } = parseLocalConfig(cache);

        if (!CachePlugin) {
            throw new Error('Local cache is not configured');
        }
        // Ensure there's only one instance of the cache plugin
        if (!mapSyncPlugins.has(CachePlugin)) {
            const cachePlugin = new CachePlugin();
            const mapValue = { plugin: cachePlugin, initialized: observable(false) };
            mapSyncPlugins.set(CachePlugin, mapValue);
            if (cachePlugin.initialize) {
                const initializePromise = cachePlugin.initialize?.(observableSyncConfiguration || {});
                if (isPromise(initializePromise)) {
                    await initializePromise;
                }
            }
            mapValue.initialized.set(true);
        }

        const { plugin, initialized: initialized$ } = mapSyncPlugins.get(CachePlugin)!;
        const cachePlugin = plugin as ObservableCachePlugin;

        localState.pluginCache = cachePlugin as ObservableCachePlugin;

        if (!initialized$.peek()) {
            await when(initialized$);
        }

        // If cache has an asynchronous load, wait for it
        if (cachePlugin.loadTable) {
            const promise = cachePlugin.loadTable(table, config);
            if (promise) {
                await promise;
            }
        }

        // Get the value from state
        let value = cachePlugin.getTable(table, config);
        const metadata = cachePlugin.getMetadata(table, config);

        if (metadata) {
            metadatas.set(obs, metadata);
            localState.pendingChanges = metadata.pending;
            // TODOV3 Remove dateModified
            syncState.assign({
                dateModified: metadata.lastSync,
                lastSync: metadata.lastSync,
            });
        }

        // Merge the data from local cache into the default state
        if (value !== undefined) {
            const { transform } = config;

            value = transformLoadData(value, { transform }, true);

            if (isPromise(value)) {
                value = await value;
            }

            // isLoadingLocal prevents saving remotely when two different caches
            // are set on the same observable
            internal.globalState.isLoadingLocal = true;

            // We want to merge the local data on top of any initial state the object is created with
            const prevValue = obs.peek();
            if (value === null && (!prevValue || (prevValue as any)[symbolLinked])) {
                obs.set(value);
            } else {
                mergeIntoObservable(obs, value);
            }

            internal.globalState.isLoadingLocal = false;
        }

        const node = getNode(obs);

        (node.state as Observable<ObservableSyncState>).peek().clearLocal = () =>
            Promise.all([
                cachePlugin.deleteTable(table, config),
                cachePlugin.deleteMetadata(table, config),
            ]) as unknown as Promise<void>;
    }
    syncState.isLoadedLocal.set(true);
}
export type WithoutState = any[] | Primitive | (Record<string, any> & { _state?: never });

export function syncObservable<T>(
    obs: ObservableParam<T>,
    syncOptions: SyncedParams<T>,
): Observable<ObservableSyncState> {
    const node = getNode(obs);

    // Merge remote sync options with global options
    if (syncOptions) {
        syncOptions = Object.assign(
            {
                syncMode: 'auto',
            } as SyncedParams,
            observableSyncConfiguration,
            removeNullUndefined(syncOptions),
        );
    }
    const localState: LocalState = {};
    let sync: () => Promise<void>;

    const syncState = (node.state = observable<ObservableSyncState>({
        isLoadedLocal: false,
        isLoaded: !syncOptions.get,
        isEnabledLocal: true,
        isEnabledRemote: true,
        clearLocal: undefined as unknown as () => Promise<void>,
        sync: () => Promise.resolve(),
        getPendingChanges: () => localState.pendingChanges,
    }));

    loadLocal(obs, syncOptions, syncState, localState);

    localState.pluginSync = syncObservableAdapter(syncOptions);

    if (syncOptions.get) {
        let isSynced = false;
        sync = async () => {
            const lastSync = metadatas.get(obs)?.lastSync;
            const pending = localState.pendingChanges;
            const get = localState.pluginSync!.get?.bind(localState.pluginSync);

            if (get) {
                const runGet = () => {
                    get({
                        state: syncState,
                        obs,
                        options: syncOptions,
                        lastSync,
                        dateModified: lastSync,
                        onError: (error: Error) => {
                            syncOptions.onGetError?.(error);
                        },
                        onGet: () => {
                            node.state!.assign({
                                isLoaded: true,
                                error: undefined,
                            });
                        },
                        onChange: async ({ value, path = [], pathTypes = [], mode = 'set', lastSync }) => {
                            // Note: value is the constructed value, path is used for setInObservableAtPath
                            // to start the set into the observable from the path
                            if (value !== undefined) {
                                value = transformLoadData(value, syncOptions, true);
                                if (isPromise(value)) {
                                    value = await (value as Promise<T>);
                                }

                                if (mode === 'lastSync' || mode === 'dateModified') {
                                    if (lastSync && !isEmpty(value as unknown as object)) {
                                        onChangeRemote(() => {
                                            setInObservableAtPath(obs, path as string[], pathTypes, value, 'assign');
                                        });
                                    }
                                } else {
                                    const pending = localState.pendingChanges;
                                    if (pending) {
                                        Object.keys(pending).forEach((key) => {
                                            const p = key.split('/').filter((p) => p !== '');
                                            const { v, t } = pending[key];

                                            if (t.length === 0 || !value) {
                                                value = v;
                                            } else if ((value as any)[p[0]] !== undefined) {
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
                                        // @ts-expect-error Fix this type
                                        setInObservableAtPath(obs, path as string[], pathTypes, value, mode);
                                    });
                                }
                            }
                            if (lastSync && syncOptions.cache) {
                                updateMetadata(obs, localState, syncState, syncOptions, {
                                    lastSync,
                                });
                            }
                        },
                    });
                };
                runGet();
            } else {
                node.state!.assign({
                    isLoaded: true,
                    error: undefined,
                });
            }
            if (!isSynced) {
                isSynced = true;
                // Wait for remote to be ready before saving pending
                await when(() => syncState.isLoaded.get() || (syncOptions.allowSetIfGetError && syncState.error.get()));

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
                    // TODO: Not sure why this needs to as unknown as Observable
                    onObsChange(obs as unknown as Observable, syncState, localState, syncOptions, {
                        value: obs.peek(),
                        loading: false,
                        remote: false,
                        // TODO getPrevious if any remote sync layers need it
                        getPrevious: () => undefined,
                        changes,
                    });
                    localState.isApplyingPending = false;
                }
            }
        };

        syncState.assign({ sync });
    }

    // Wait for this node and all parent nodes up the hierarchy to be loaded
    const onAllLoadedLocal = () => {
        let parentNode: NodeValue | undefined = node;
        while (parentNode) {
            if (parentNode.state?.isLoadedLocal?.get() === false) {
                return false;
            }
            parentNode = parentNode.parent;
        }
        return true;
    };
    // When all is loaded locally we can start syncing and listening for changes
    when(onAllLoadedLocal, function (this: any) {
        // If remote is not manual, then sync() is called automatically
        if (syncOptions.get && syncOptions.syncMode === 'auto') {
            sync();
        }

        obs.onChange(onObsChange.bind(this, obs as any, syncState, localState, syncOptions as SyncedParams<any>));
    });

    return syncState;
}
