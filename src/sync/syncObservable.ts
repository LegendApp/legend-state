import type {
    Change,
    ClassConstructor,
    ListenerParams,
    NodeValue,
    Observable,
    ObservableObject,
    ObservableParam,
    TypeAtPath,
    UpdateFnParams,
} from '@legendapp/state';
import {
    beginBatch,
    constructObjectWithPath,
    deconstructObjectWithPath,
    endBatch,
    internal,
    isArray,
    isEmpty,
    isFunction,
    isObject,
    isPromise,
    isString,
    mergeIntoObservable,
    observable,
    setAtPath,
    shouldIgnoreUnobserved,
    when,
} from '@legendapp/state';
import { observableSyncConfiguration } from './configureObservableSync';
import type { ObservableOnChangeParams } from './persistTypes';
import { removeNullUndefined } from './syncHelpers';
import { syncObservableAdapter } from './syncObservableAdapter';
import type {
    ObservablePersistPlugin,
    ObservableSyncClass,
    ObservableSyncState,
    PersistMetadata,
    PersistOptions,
    SyncTransform,
    SyncTransformMethod,
    Synced,
    SyncedOptions,
} from './syncTypes';

const { createPreviousHandler, clone, getValueAtPath, globalState, symbolLinked, getNode, getNodeValue } = internal;

export const mapSyncPlugins: WeakMap<
    ClassConstructor<ObservablePersistPlugin | ObservableSyncClass>,
    {
        plugin: ObservablePersistPlugin | ObservableSyncClass;
        initialized: Observable<boolean>;
    }
> = new WeakMap();

const metadatas = new WeakMap<ObservableParam<any>, PersistMetadata>();
const promisesLocalSaves = new Set<Promise<void>>();

interface LocalState {
    pluginPersist?: ObservablePersistPlugin;
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

export function transformSaveData(
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    { transform }: { transform?: SyncTransform },
): Promise<any> | any {
    if (transform?.save) {
        const constructed = constructObjectWithPath(path, pathTypes, value);
        const saved = transform.save(constructed);
        value = deconstructObjectWithPath(path, pathTypes, saved);
    }

    return value;
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

    const { lastSync, pending } = newMetadata;

    const needsUpdate = pending || (lastSync && (!oldMetadata || lastSync !== oldMetadata.lastSync));

    if (needsUpdate) {
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
    const { syncState, changes, localState, syncOptions, inRemoteChange, isApplyingPending } = queuedChange;

    const persist = syncOptions.persist;
    const { pluginSync } = localState;
    const { config: configLocal } = parseLocalConfig(persist);
    const configRemote = syncOptions;
    const saveLocal = persist?.name && !configLocal.readonly && !isApplyingPending && syncState.isPersistEnabled.peek();
    const saveRemote = !!(
        !inRemoteChange &&
        pluginSync?.set &&
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
        valuePrevious,
    } = queuedChange;

    const persist = syncOptions.persist;
    const { pluginSync } = localState;
    const { config: configLocal } = parseLocalConfig(persist!);
    const configRemote = syncOptions;
    const saveLocal = persist && !configLocal.readonly && !isApplyingPending && syncState.isPersistEnabled.peek();
    const saveRemote =
        !inRemoteChange && pluginSync?.set && configRemote?.enableSync !== false && syncState.isSyncEnabled.peek();

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
async function doChangeRemote(changeInfo: PreppedChangeRemote | undefined) {
    if (!changeInfo) return;

    const { queuedChange, changesRemote } = changeInfo;
    const { value$: obs, syncState, localState, syncOptions, valuePrevious: previous } = queuedChange;
    const { pluginPersist, pluginSync } = localState;

    const persist = syncOptions.persist;
    const { table, config: configLocal } = parseLocalConfig(persist!);
    const { allowSetIfGetError, onBeforeSet, onSetError, waitForSet, onAfterSet } =
        syncOptions || ({} as SyncedOptions);
    const shouldSaveMetadata = persist?.retrySync;

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

        let value = obs.peek();
        const transformSave = syncOptions?.transform?.save;
        if (transformSave) {
            // Clone value before transforming to ensure it doesn't change observable value
            value = transformSave(clone(value));
        }

        onBeforeSet?.();

        localState.numSavesOutstanding = (localState.numSavesOutstanding || 0) + 1;

        let savedPromise = pluginSync!.set!({
            value$: obs,
            syncState: syncState,
            options: syncOptions,
            changes: changesRemote,
            value,
            valuePrevious: previous,
        });
        if (isPromise(savedPromise)) {
            savedPromise = savedPromise.catch((err) => onSetError?.(err));
        }

        const saved = await savedPromise;

        localState.numSavesOutstanding--;

        // If this remote save changed anything then update cache and metadata
        // Because save happens after a timeout and they're batched together, some calls to save will
        // return saved data and others won't, so those can be ignored.
        if (saved !== undefined) {
            const pathStrs = Array.from(new Set(changesRemote.map((change) => change.pathStr)));
            const { changes, lastSync } = saved;
            if (pathStrs.length > 0) {
                let transformedChanges: object | undefined = undefined;
                const metadata: PersistMetadata = {};
                if (persist) {
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

                if (localState.numSavesOutstanding > 0) {
                    if (transformedChanges) {
                        if (!localState.pendingSaveResults) {
                            localState.pendingSaveResults = [];
                        }
                        localState.pendingSaveResults.push(transformedChanges);
                    }
                } else {
                    let allChanges = [...(localState.pendingSaveResults || []), transformedChanges].filter(
                        (v) => v !== undefined,
                    );
                    if (allChanges.length > 0) {
                        if (allChanges.some((change) => isPromise(change))) {
                            allChanges = await Promise.all(allChanges);
                        }
                        onChangeRemote(() => mergeIntoObservable(obs, ...allChanges));
                    }

                    if (persist) {
                        if (shouldSaveMetadata && !isEmpty(metadata)) {
                            updateMetadata(obs, localState, syncState, syncOptions, metadata);
                        }
                    }

                    localState.pendingSaveResults = [];
                }
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

    if (persist) {
        const PersistPlugin: ClassConstructor<ObservablePersistPlugin> =
            persist.plugin! || observableSyncConfiguration.persist?.plugin;
        const { table, config } = parseLocalConfig(persist);
        const node = getNode(value$);

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

        getNodeValue(getNode(node.state!)).clearPersist = () =>
            Promise.all([
                persistPlugin.deleteTable(table, config),
                persistPlugin.deleteMetadata(table, config),
            ]) as unknown as Promise<void>;
    }
    syncState.isPersistLoaded.set(true);
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

    // Merge remote sync options with global options
    syncOptions = {
        syncMode: 'auto',
        ...observableSyncConfiguration,
        ...removeNullUndefined(syncOptions || {}),
    } as any;
    const localState: LocalState = {};
    let sync: () => Promise<void>;

    const syncState = (node.state = observable<ObservableSyncState>({
        isPersistLoaded: false,
        isLoaded: !syncOptions.get,
        isPersistEnabled: true,
        isSyncEnabled: true,
        clearPersist: undefined as unknown as () => Promise<void>,
        sync: () => Promise.resolve(),
        getPendingChanges: () => localState.pendingChanges,
    }));

    loadLocal(obs$, syncOptions, syncState, localState);

    localState.pluginSync = syncObservableAdapter(syncOptions);

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
            const get = localState.pluginSync!.get?.bind(localState.pluginSync);

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
                                    updateMetadata(obs$, localState, syncState, syncOptions, {
                                        pending,
                                    });
                                }
                            }

                            onChangeRemote(() => {
                                if (mode === 'assign' && isObject(value)) {
                                    (obs$ as unknown as Observable<object>).assign(value);
                                } else if (mode === 'append' && isArray(value)) {
                                    (obs$ as unknown as Observable<any[]>).push(...value);
                                } else if (mode === 'prepend' && isArray(value)) {
                                    (obs$ as unknown as Observable<any[]>).splice(0, 0, ...value);
                                } else if (mode === 'merge') {
                                    mergeIntoObservable(obs$, value);
                                } else {
                                    obs$.set(value);
                                }
                            });
                        }
                        if (lastSync && syncOptions.persist) {
                            updateMetadata(obs$, localState, syncState, syncOptions, {
                                lastSync,
                            });
                        }
                    };
                    get({
                        state: syncState,
                        value$: obs$,
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
                        onChange,
                    });
                    if (!isSubscribed && syncOptions.subscribe) {
                        isSubscribed = true;
                        unsubscribe = syncOptions.subscribe({
                            node,
                            value$: obs$,
                            update: (params: ObservableOnChangeParams) => {
                                when(node.state!.isLoaded, () => {
                                    params.mode ||= syncOptions.mode || 'merge';
                                    onChange(params);
                                });
                            },
                            refresh: () => when(node.state!.isLoaded, sync),
                        });
                    }
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
                    const value = getNodeValue(node);
                    onObsChange(obs$, syncState, localState, syncOptions, {
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

        syncState.assign({ sync });
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
                onObsChange.bind(this, obs$ as any, syncState, localState, syncOptions as SyncedOptions<any>),
            );
        }
    });

    return syncState;
}
