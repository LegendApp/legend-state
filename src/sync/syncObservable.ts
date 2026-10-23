import type {
    Change,
    ChangeWithPathStr,
    ClassConstructor,
    GetMode,
    ListenerParams,
    NodeInfo,
    Observable,
    ObservableObject,
    ObservableParam,
    ObservableSyncState,
    ObservableSyncStateOptions,
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
    isMap,
    isNullOrUndefined,
    isObject,
    isObservable,
    isPlainObject,
    isPromise,
    isSet,
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
import { markNodeAsSynced } from '../onChange';

const {
    clone,
    createPreviousHandler,
    deepMerge,
    findIDKey,
    getNode,
    getNodeValue,
    getValueAtPath,
    globalState,
    isHintOpaque,
    isHintPlain,
    registerMiddleware,
    symbolLinked,
    setNodeValue,
} = internal;

export const mapSyncPlugins: WeakMap<
    ClassConstructor<ObservablePersistPlugin> | ObservablePersistPlugin,
    {
        plugin: ObservablePersistPlugin;
        initialized: Observable<boolean>;
    }
> = new WeakMap();

const allSyncStates = new Map<Observable<ObservableSyncState>, NodeInfo>();
const metadatas = new WeakMap<ObservableParam<any>, PersistMetadata>();

interface LocalState {
    pluginPersist?: ObservablePersistPlugin;
    persistedRootType?: TypeAtPath;
    promisesLocalSaves?: Set<Promise<any>>;
    repairLocal?: () => Promise<void>;
    pendingChanges?: PendingChanges;
    pendingClears?: PendingChanges;
    pendingSetGeneration?: number;
    pendingSetsSinceClear?: number;
    pendingSetEpoch?: number;
    isApplyingPending?: boolean;
    timeoutSaveMetadata?: any;
}

interface PreppedChangeLocal {
    queuedChange: QueuedChange;
    changesLocal: ChangeWithPathStr[];
    saveRemote: boolean;
}

type PendingTransport = Map<string, { entry: PendingChanges[string]; value: any }>;

interface PreppedChangeRemote {
    queuedChange: QueuedChange;
    changesRemote: ChangeWithPathStr[];
    changesLocal?: Map<string, ChangeWithPathStr>;
    rootSnapshot?: { value: any; supported: boolean; previous: any; history: PendingHistoryTree | undefined };
}

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

// Value-form initial containers become observable backing state and can be mutated in place.
// Snapshot the mutable containers Legend tracks so every reset can restore a fresh value.
function cloneInitialValue<T>(value: T, seen?: Map<object, any>): T {
    if (!value || typeof value !== 'object' || isHintOpaque(value)) {
        return value;
    }
    if (value instanceof Date) {
        return new Date(value) as T;
    }
    seen ||= new Map<object, any>();
    if (seen.has(value)) {
        return seen.get(value);
    }

    let out: any;
    if (isArray(value)) {
        out = new Array(value.length);
        seen.set(value, out);
        value.forEach((item, index) => {
            out[index] = cloneInitialValue(item, seen);
        });
    } else if (value instanceof Map) {
        out = new Map();
        seen.set(value, out);
        value.forEach((item, key) => {
            out.set(key, cloneInitialValue(item, seen));
        });
    } else if (value instanceof Set) {
        out = new Set(value);
        seen.set(value, out);
    } else if (isPlainObject(value)) {
        out = {};
        seen.set(value, out);
        Reflect.ownKeys(value).forEach((key) => {
            if (Object.prototype.propertyIsEnumerable.call(value, key)) {
                out[key] = cloneInitialValue((value as Record<PropertyKey, any>)[key], seen);
            }
        });
    } else {
        return value;
    }

    if (isHintPlain(value)) {
        ObservableHint.plain(out);
    }

    return out;
}

function queueLocalSave(localState: LocalState, save: () => void | Promise<void>) {
    try {
        const prior = localState.promisesLocalSaves;
        const promise = doInOrder(prior?.size ? Promise.allSettled(prior) : undefined, save);
        if (isPromise(promise)) {
            const saves = (localState.promisesLocalSaves ||= new Set());
            saves.add(promise);
            return promise.then(
                () => {
                    saves.delete(promise);
                },
                (error) => {
                    saves.delete(promise);
                    throw error;
                },
            );
        }
    } catch (error) {
        return Promise.reject(error);
    }
}

function writeMetadata<T>(
    value$: ObservableParam<any>,
    localState: LocalState,
    syncState$: Observable<ObservableSyncState>,
    syncOptions: SyncedOptions<T>,
    newMetadata: PersistMetadata,
) {
    const { pluginPersist } = localState;
    const { table, config } = parseLocalConfig(syncOptions.persist!);
    const oldMetadata: PersistMetadata | undefined = metadatas.get(value$);
    const { lastSync } = newMetadata;
    const metadata = Object.assign({}, oldMetadata, newMetadata);
    metadatas.set(value$, metadata);
    return doInOrder(pluginPersist?.setMetadata(table, metadata, config), () => {
        if (lastSync) syncState$.assign({ lastSync });
    });
}

function updateMetadataImmediate<T>(
    value$: ObservableParam<any>,
    localState: LocalState,
    syncState$: Observable<ObservableSyncState>,
    syncOptions: SyncedOptions<T>,
    newMetadata: PersistMetadata,
) {
    const prior = localState.promisesLocalSaves;
    const ready = prior?.size
        ? Promise.all(prior).then(
              () => undefined,
              (error) => ({ error }),
          )
        : undefined;
    return queueLocalSave(localState, () =>
        doInOrder(ready, (failed) => {
            if (failed) throw failed.error;
            return writeMetadata(value$, localState, syncState$, syncOptions, newMetadata);
        }),
    );
}

function updateMetadata<T>(
    value$: ObservableParam<any>,
    localState: LocalState,
    syncState: ObservableObject<ObservableSyncState>,
    syncOptions: SyncedOptions<T>,
    newMetadata: PersistMetadata,
    onError: (error: Error) => void,
) {
    if (localState.timeoutSaveMetadata) {
        clearTimeout(localState.timeoutSaveMetadata);
    }
    metadatas.set(value$, { ...(metadatas.get(value$) || {}), ...newMetadata });
    localState.timeoutSaveMetadata = setTimeout(() => {
        const saved = updateMetadataImmediate(value$, localState, syncState, syncOptions, metadatas.get(value$)!);
        if (isPromise(saved)) saved.catch(onError);
    }, 0);
}

type PendingChange = Change & { k?: (string | number)[]; d?: true };

interface QueuedChange<T = any> {
    inRemoteChange: boolean;
    isApplyingPending: boolean;
    value$: Observable<T>;
    syncState: ObservableObject<ObservableSyncState>;
    localState: LocalState;
    syncOptions: SyncedOptions<T>;
    changes: PendingChange[];
    getPrevious: () => T;
}

let _queuedChanges: QueuedChange[] = [];
const _queuedRemoteChanges: Map<SyncedOptions, QueuedChange[]> = new Map();
const _queuedRemoteChangesTimeouts: Map<SyncedOptions, number> = new Map();

function mergeChanges(changes: PendingChange[]) {
    const changesByPath = new Map<string, PendingChange>();
    const changesOut: PendingChange[] = [];
    // TODO: This could be even more robust by going deeper into paths like the firebase plugin's _updatePendingSave
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const pathStr = change.path.join('/');
        const existing = changesByPath.get(pathStr);
        if (existing) {
            // If setting a value back to what it was, no need to save it
            if (change.valueAtPath === existing.prevAtPath && !(change.k && change.valueAtPath === undefined)) {
                const idx = changesOut.indexOf(existing);
                if (idx >= 0) {
                    changesOut.splice(idx, 1);
                }
                changesByPath.delete(pathStr);
            } else {
                existing.valueAtPath = change.valueAtPath;
                existing.pathTypes = change.pathTypes;
                if (change.k || existing.k) {
                    existing.k = change.k;
                    existing.d = change.d;
                }
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

function reportSetError(
    { syncState, syncOptions }: Pick<QueuedChange, 'syncState' | 'syncOptions'>,
    error: unknown,
    input: () => any,
) {
    syncState.error.set(error as Error);
    syncOptions.onError?.(error as Error, {
        source: 'set',
        type: 'set',
        syncOptions,
        retry: { retryNum: 0, cancelRetry: false },
        input: input(),
    });
}

async function processQueuedChanges() {
    // Get a local copy of the queued changes and clear the global queue
    const queuedChanges = mergeQueuedChanges(_queuedChanges);
    _queuedChanges = [];

    const pendingSyncOptions = new Set<SyncedOptions>();
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

    const enqueueRemote = (change: QueuedChange) => {
        if (!change.inRemoteChange) {
            const { syncOptions } = change;
            if (!_queuedRemoteChanges.has(syncOptions)) _queuedRemoteChanges.set(syncOptions, []);
            _queuedRemoteChanges.get(syncOptions)!.push(change);
            pendingSyncOptions.add(syncOptions);
        }
    };
    const localSaves = queuedChanges.map((change) => {
        if (!change.syncOptions.persist?.name) return;
        let prepare!: (save: () => void | Promise<void>) => void;
        const prepared = new Promise<() => void | Promise<void>>((resolve) => {
            prepare = resolve;
        });
        // Reserve the complete write before a persistence transform can yield.
        const saved = Promise.resolve(queueLocalSave(change.localState, () => prepared.then((save) => save()))).then(
            () => enqueueRemote(change),
            (error) => reportSetError(change, error, () => change.value$.peek()),
        );
        return { prepare, saved };
    });
    const localResults = await Promise.allSettled(queuedChanges.map(prepChangeLocal));
    const remoteResults = await Promise.allSettled(
        queuedChanges.map((change, index) =>
            localResults[index].status === 'fulfilled' ? prepChangeRemote(change) : undefined,
        ),
    );
    await Promise.all(
        localResults.map(async (local, index) => {
            const write = () => {
                if (local.status === 'rejected') throw local.reason;
                const remote = remoteResults[index];
                if (remote.status === 'rejected') throw remote.reason;
                return doChangeLocal(local.value);
            };
            const save = localSaves[index];
            if (save) {
                save.prepare(write);
                await save.saved;
            } else {
                try {
                    await write();
                    enqueueRemote(queuedChanges[index]);
                } catch (error) {
                    const change = queuedChanges[index];
                    reportSetError(change, error, () => change.value$.peek());
                }
            }
        }),
    );

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

        const preppedChangesRemote = await Promise.allSettled(
            queuedRemoteChanges.map((change) => prepChangeRemote(change, true)),
        );
        preppedChangesRemote.forEach((result, index) => {
            if (result.status === 'fulfilled') doChangeRemote(result.value);
            else {
                const change = queuedRemoteChanges[index];
                reportSetError(change, result.reason, () => change.value$.peek());
            }
        });
    }
}

async function prepChangeLocal(queuedChange: QueuedChange): Promise<PreppedChangeLocal | undefined> {
    const {
        value$: obs$,
        syncState,
        localState,
        changes,
        syncOptions,
        inRemoteChange,
        isApplyingPending,
    } = queuedChange;

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
        const value = saveLocal ? obs$.peek() : undefined;
        // Nested patches cannot establish a missing or differently typed persisted root collection.
        const shouldSaveWholeValue =
            saveLocal &&
            localState.persistedRootType !== internal.getPathType(value) &&
            changes.every((change) => change.path.length > 0);
        const changesToPersist: Change[] = shouldSaveWholeValue
            ? [{ path: [], pathTypes: [], prevAtPath: queuedChange.getPrevious(), valueAtPath: value }]
            : changes;

        if (saveRemote && shouldSaveWholeValue) {
            // The local save covers the whole value; pending still records each latest change.
            const recorded = new Set<string>();
            for (let i = changes.length - 1; i >= 0; i--) {
                const { path } = changes[i];
                if (path.some((_, u) => recorded.has(path.slice(0, u + 1).join('/')))) continue;
                recorded.add(path.join('/'));
                recordPendingChange(queuedChange, changes[i]);
            }
        }

        // Reverse order
        for (let i = changesToPersist.length - 1; i >= 0; i--) {
            const { path } = changesToPersist[i];

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

                const { prevAtPath, valueAtPath, pathTypes } = changesToPersist[i];
                // Capture intent in reservation order before a persistence transform can yield.
                if (saveRemote && !shouldSaveWholeValue) recordPendingChange(queuedChange, changes[i]);
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
async function prepChangeRemote(
    queuedChange: QueuedChange,
    consolidatePending = false,
): Promise<PreppedChangeRemote | undefined> {
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
        const pendingParents = consolidatePending ? new Set<string>() : undefined;
        if (pendingParents)
            for (const key of Object.keys(localState.pendingChanges || {})) {
                if (!key) continue;
                const path = localState.pendingChanges![key].k || key.split('/');
                for (let i = 0; i < path.length; i++) pendingParents.add(path.slice(0, i).join('/'));
            }
        const changesRemote: ChangeWithPathStr[] = [];
        const changesLocal = syncOptions.transform?.save ? new Map<string, ChangeWithPathStr>() : undefined;
        let rootSnapshot: PreppedChangeRemote['rootSnapshot'];
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
                    if (changesLocal) {
                        const local: ChangeWithPathStr & PendingChange = {
                            path,
                            pathTypes,
                            prevAtPath,
                            pathStr,
                            valueAtPath: path.length ? clonePendingValue(valueAtPath) : valueAtPath,
                        };
                        if (changes[i].k) {
                            local.k = changes[i].k;
                            if (changes[i].d) local.d = true;
                        }
                        changesLocal.set(pathStr, local);
                    }
                    const captureRoot =
                        consolidatePending &&
                        !isApplyingPending &&
                        changesLocal &&
                        !syncOptions.fieldId &&
                        !path.length;
                    const snapshot =
                        pendingParents?.has(pathStr) || captureRoot
                            ? snapshotPendingLocal(valueAtPath, undefined)
                            : undefined;
                    let pendingToMerge: PendingTransport | undefined;
                    if (pendingParents?.has(pathStr)) {
                        if (!valueAtPath || typeof valueAtPath !== 'object' || snapshot !== undefined) {
                            const prefix = pathStr ? pathStr + '/' : '';
                            for (const key of Object.keys(localState.pendingChanges || {})) {
                                if (key === pathStr || (pathStr && !key.startsWith(prefix))) continue;
                                const entry = localState.pendingChanges![key];
                                if (entry.k && path.some((part, index) => entry.k![index] !== part)) continue;
                                const resolved = readPendingEntry(snapshot, key, entry, path.length);
                                if (!resolved) continue;
                                const value = resolved.value;
                                const captured = snapshotPendingLocal(entry.v, value);
                                if (
                                    Object.is(captured, value) &&
                                    (!entry.v || typeof entry.v !== 'object' || captured !== undefined)
                                ) {
                                    (pendingToMerge ||= new Map()).set(key, { entry, value });
                                }
                            }
                        }
                    }
                    if (pendingToMerge?.size) recordPendingChange(queuedChange, changes[i], pendingToMerge);
                    if (captureRoot) {
                        const pending = localState.pendingChanges?.[''];
                        rootSnapshot = {
                            value: snapshot,
                            supported: !valueAtPath || typeof valueAtPath !== 'object' || snapshot !== undefined,
                            previous: pending?.p,
                            history: pending?.h ? pendingHistoryTree(pending.h) : unknownPendingHistory,
                        };
                    }
                    const promiseTransformRemote = transformSaveData(
                        valueAtPath,
                        path as string[],
                        pathTypes,
                        syncOptions || {},
                    );

                    promisesTransform.push(
                        doInOrder(promiseTransformRemote, ({ value: valueTransformed, path: pathTransformed }) => {
                            // Prepare the remote change with the transformed path/value
                            const remote: ChangeWithPathStr & PendingChange = {
                                path: pathTransformed,
                                pathTypes,
                                prevAtPath,
                                valueAtPath: valueTransformed,
                                pathStr,
                            };
                            if (changes[i].k) {
                                remote.k = changes[i].k;
                                if (changes[i].d) remote.d = true;
                            }
                            changesRemote.push(remote);
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
        return { queuedChange, changesRemote, changesLocal, rootSnapshot };
    }
}

function recordPendingChange(queuedChange: QueuedChange, change: PendingChange, transport?: PendingTransport) {
    const { localState, syncOptions, isApplyingPending } = queuedChange;
    const { path, pathTypes, prevAtPath, valueAtPath } = change;
    // Known limitation: joined keys are not unique, so a key containing '/' (or Map keys 1 and '1')
    // shares a pending entry with the path it spells. Fixing it needs a new persisted key format.
    const pathStr = path.join('/');
    // Prepare pending changes
    if (!localState.pendingChanges) {
        localState.pendingChanges = {};
    }

    // First look for existing pending changes at a higher level than this change
    // If they exist then merge this change into it
    let found = false;
    for (let i = 0; !transport && !found && i < path.length - 1; i++) {
        const pathParent = path.slice(0, i + 1).join('/');
        if (
            Object.prototype.hasOwnProperty.call(localState.pendingChanges, pathParent) &&
            localState.pendingChanges[pathParent]?.v
        ) {
            const candidate = localState.pendingChanges[pathParent];
            if (candidate.k && candidate.k.some((key, index) => key !== path[index])) continue;
            found = true;
            const pathChild = path.slice(i + 1);
            const pathTypesChild = pathTypes.slice(i + 1);
            const parent = localState.pendingChanges[pathParent];
            if (!isApplyingPending) {
                const node = getNode(queuedChange.value$);
                const relative = pendingHistoryPath(parent.p, parent.v, pathChild, node, syncOptions.fieldId);
                if (relative) {
                    const keys = addPendingHistory(
                        parent,
                        relative.previous,
                        prevAtPath,
                        relative.path,
                        node,
                        syncOptions.fieldId,
                    );
                    if (!parent.c)
                        addPendingHistory(
                            parent,
                            prevAtPath,
                            valueAtPath,
                            relative.path,
                            node,
                            syncOptions.fieldId,
                            keys,
                        );
                } else parent.h = undefined;
            }
            parent.v = change.k
                ? writePendingPath(parent.v, pathChild as string[], pathTypesChild, valueAtPath, change.d)
                : setAtPath(parent.v, pathChild, pathTypesChild, valueAtPath);
            if (localState.pendingClears?.[pathParent]) {
                delete localState.pendingClears[pathParent];
            }
        }
    }
    if (!found) {
        const existing = Object.prototype.hasOwnProperty.call(localState.pendingChanges, pathStr)
            ? localState.pendingChanges[pathStr]
            : undefined;
        if (transport && !existing) return;
        const entry = existing || {
            p: prevAtPath ?? null,
            t: pathTypes,
            h: isApplyingPending ? undefined : emptyPendingHistory,
        };
        if (!existing) {
            Object.defineProperty(localState.pendingChanges, pathStr, {
                value: entry,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        let historyKeys: Set<string> | undefined;
        if (existing && !isApplyingPending && !transport) {
            historyKeys = addPendingHistory(
                entry,
                entry.p,
                prevAtPath,
                [],
                getNode(queuedChange.value$),
                syncOptions.fieldId,
            );
        }
        // If an existing pending change is deeper than this change, just delete it
        // in favor of this wider change
        const pathPrefix = pathStr ? pathStr + '/' : '';
        for (const key in localState.pendingChanges) {
            if (key !== pathStr && (!pathStr || key.startsWith(pathPrefix))) {
                const childPath = localState.pendingChanges[key].k;
                if (childPath && path.some((part, index) => childPath[index] !== part)) continue;
                if (transport) {
                    const captured = transport.get(key);
                    const child = localState.pendingChanges[key];
                    if (!captured || child !== captured.entry) continue;
                    const value = snapshotPendingLocal(child.v, captured.value);
                    if (
                        !Object.is(value, captured.value) ||
                        (child.v && typeof child.v === 'object' && value === undefined)
                    )
                        continue;
                }
                if (!isApplyingPending) {
                    const child = localState.pendingChanges[key];
                    const relativePath = child.k?.slice(path.length) || key.split('/').slice(path.length);
                    const node = getNode(queuedChange.value$);
                    const relative =
                        child.t.length === relativePath.length + path.length
                            ? pendingHistoryPath(prevAtPath, prevAtPath, relativePath, node, syncOptions.fieldId)
                            : undefined;
                    if (!relative || !child.h) entry.h = undefined;
                    else {
                        historyKeys = addPendingHistory(
                            entry,
                            child.p,
                            relative.previous,
                            relative.path,
                            node,
                            syncOptions.fieldId,
                            historyKeys,
                        );
                        for (const path of child.h)
                            historyKeys = markPendingHistory(entry, [...relative.path, ...path], historyKeys);
                    }
                }
                delete localState.pendingChanges[key];
                if (localState.pendingClears?.[key]) {
                    delete localState.pendingClears[key];
                }
            }
        }
        // Pending value is the untransformed value because it gets loaded without transformment
        // and forwarded through to onObsChange where it gets transformed before save
        if (!transport && (!isApplyingPending || !existing)) entry.v = valueAtPath;
        if (!transport && !isApplyingPending) {
            entry.c = true;
            if (change.k || entry.k) {
                entry.k = change.k;
                entry.d = change.d;
            }
        }
        if (localState.pendingClears?.[pathStr]) {
            delete localState.pendingClears[pathStr];
        }
    }
}

function doChangeLocal(changeInfo: PreppedChangeLocal | undefined) {
    if (!changeInfo) return;
    const { queuedChange, changesLocal, saveRemote } = changeInfo;
    const { value$: obs, syncState, localState, syncOptions } = queuedChange;
    const { pluginPersist } = localState;
    const persist = syncOptions.persist;
    if (persist?.name) {
        const { table, config: configLocal } = parseLocalConfig(persist);
        return doInOrder(
            saveRemote && persist.retrySync
                ? writeMetadata(obs, localState, syncState, syncOptions, { pending: localState.pendingChanges })
                : undefined,
            () =>
                changesLocal.length
                    ? doInOrder(pluginPersist!.set(table, changesLocal, configLocal), () => {
                          const rootChange = changesLocal.find((change) => change.path.length === 0);
                          if (rootChange) localState.persistedRootType = internal.getPathType(rootChange.valueAtPath);
                      })
                    : undefined,
        );
    }
}

type PendingHistory = NonNullable<PendingChanges[string]['h']>;
type PendingHistoryTree = { children?: Map<string | number, PendingHistoryTree>; unknown?: boolean };
const emptyPendingHistory: PendingHistory = [];
const unknownPendingHistory: PendingHistoryTree = { unknown: true };
const pendingHistoryCaches = new WeakMap<
    PendingHistory,
    {
        keys?: Set<string>;
        keysLength?: number;
        tree?: PendingHistoryTree;
        treeLength?: number;
    }
>();

function pendingHistoryKey(path: readonly (string | number)[]): string {
    return JSON.stringify(path.map((key) => [typeof key, String(key)]));
}

function markPendingHistory(
    entry: PendingChanges[string],
    path: (string | number)[],
    keys?: Set<string>,
): Set<string> | undefined {
    if (!entry.h) return keys;
    let cached = pendingHistoryCaches.get(entry.h);
    keys ||=
        cached?.keys && cached.keysLength === entry.h.length ? cached.keys : new Set(entry.h.map(pendingHistoryKey));
    const key = pendingHistoryKey(path);
    if (!keys.has(key)) {
        keys.add(key);
        if (entry.h === emptyPendingHistory) entry.h = [];
        entry.h.push(path);
    }
    if (!cached) {
        cached = {};
        pendingHistoryCaches.set(entry.h, cached);
    }
    cached.keys = keys;
    cached.keysLength = entry.h.length;
    return keys;
}

function pendingPathKey(value: any, key: string): string | number | undefined {
    try {
        if (value instanceof Map) {
            const number = Number(key);
            const hasString = Map.prototype.has.call(value, key);
            const hasNumber = String(number) === key && Map.prototype.has.call(value, number);
            if (hasString && hasNumber) return;
            if (hasNumber) return number;
            if (!hasString) return;
        }
        return key;
    } catch {
        return;
    }
}

function readPendingPath(value: any, path: string[], types?: TypeAtPath[]) {
    const hasTypes = !!types?.length;
    if (hasTypes && types!.length !== path.length) return;
    const resolved: string[] = [];
    try {
        for (let i = 0; i < path.length; i++) {
            const part = path[i];
            if (!hasTypes && value != null) {
                let joined = part;
                for (let j = i + 1; j < path.length; j++) {
                    joined += '/' + path[j];
                    if (
                        value instanceof Map
                            ? Map.prototype.has.call(value, joined)
                            : Object.prototype.hasOwnProperty.call(value, joined)
                    )
                        return;
                }
            }
            const key = pendingPathKey(value, part);
            if (key === undefined) return;
            resolved.push(key as string);
            value = value && (value instanceof Map ? Map.prototype.get.call(value, key) : value[key]);
        }
        return { path: resolved, value };
    } catch {
        return;
    }
}

function readPendingEntry(
    value: any,
    key: string,
    entry: PendingChanges[string],
    offset = 0,
): ReturnType<typeof readPendingPath> | ReturnType<typeof readOwnPendingPath> {
    if (!entry.k) {
        const path = key ? key.split('/') : [];
        return readPendingPath(value, offset ? path.slice(offset) : path, offset ? entry.t.slice(offset) : entry.t);
    }
    try {
        if (!isArray(entry.k) || entry.k.length !== entry.t.length) return;
        for (const part of entry.k) {
            if (typeof part !== 'string' && (typeof part !== 'number' || !Number.isFinite(part))) return;
        }
        if (entry.k.join('/') !== key) return;
        return readOwnPendingPath(value, entry.k.slice(offset) as string[]);
    } catch {
        return;
    }
}

function readOwnPendingPath(value: any, path: string[]) {
    let exists = true;
    let parentsExist = true;
    let missingAncestor: string[] | undefined;
    let nilWritable = value !== null && (typeof value === 'object' || typeof value === 'function');
    try {
        for (let i = 0; i < path.length; i++) {
            const part = path[i];
            exists =
                value instanceof Map
                    ? Map.prototype.has.call(value, part)
                    : value != null && Object.prototype.hasOwnProperty.call(value, part);
            value = exists ? (value instanceof Map ? Map.prototype.get.call(value, part) : value[part]) : undefined;
            if (i < path.length - 1) {
                if (!exists && parentsExist && nilWritable && !missingAncestor) missingAncestor = path.slice(0, i + 1);
                if (value === undefined || value === null) parentsExist = false;
                else if (typeof value !== 'object' && typeof value !== 'function') {
                    nilWritable = false;
                    if (value !== internal.symbolDelete) parentsExist = false;
                }
            }
        }
        return { path, value, exists, parentsExist, nilWritable, missingAncestor };
    } catch {
        return;
    }
}

function writePendingPath(value: any, path: string[], types: TypeAtPath[], next: any, deleted?: true) {
    if (!deleted && next !== undefined) return setAtPath(value, path, types, next);
    let parent = value;
    for (let i = 0; i < path.length - 1; i++) {
        if (!parent) return value;
        const key = path[i];
        let child =
            parent instanceof Map
                ? Map.prototype.get.call(parent, key)
                : Object.prototype.hasOwnProperty.call(parent, key)
                  ? parent[key]
                  : undefined;
        if (child === undefined || child === null) {
            if (deleted) return value;
            child = internal.initializePathType(types[i]);
            if (parent instanceof Map) Map.prototype.set.call(parent, key, child);
            else
                Object.defineProperty(parent, key, {
                    value: child,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
        }
        parent = child;
    }
    const key = path[path.length - 1];
    if (parent instanceof Map) {
        if (deleted) Map.prototype.delete.call(parent, key);
        else Map.prototype.set.call(parent, key, next);
    } else if (parent) {
        if (deleted) delete parent[key];
        else Object.defineProperty(parent, key, { value: next, enumerable: true, configurable: true, writable: true });
    }
    return value;
}

// A sealed instance's writable slot keeps its attributes; only the value changes.
function definePendingSlot(parent: any, key: string, value: any, descriptor?: PropertyDescriptor) {
    Object.defineProperty(
        parent,
        key,
        descriptor && !descriptor.configurable
            ? { value }
            : { value, enumerable: true, configurable: true, writable: true },
    );
}

function overlayPendingPath(
    value: any,
    path: string[],
    types: TypeAtPath[],
    next: any,
    entry?: PendingChanges[string],
) {
    let parent = value;
    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1 && next === undefined && !entry?.k && (!parent || typeof parent !== 'object')) {
            const descriptor = parent == null ? undefined : Object.getOwnPropertyDescriptor(parent, key);
            if (!descriptor || ('value' in descriptor && descriptor.value === undefined)) return value;
        }
        if (!parent || typeof parent !== 'object') return;
        const map = parent instanceof Map;
        const descriptor = map ? undefined : Object.getOwnPropertyDescriptor(parent, key);
        if (descriptor && !('value' in descriptor)) return;
        let child = map ? Map.prototype.get.call(parent, key) : descriptor?.value;
        if (i === path.length - 1) {
            if (entry?.k && entry.d) {
                if (map) Map.prototype.delete.call(parent, key);
                else delete parent[key];
            } else if (next !== undefined || entry?.k || child !== undefined) {
                if (map) Map.prototype.set.call(parent, key, next);
                else definePendingSlot(parent, key, next, descriptor);
            }
        } else {
            if (child === undefined || child === null) {
                if (entry?.k && entry.d) return value;
                child = internal.initializePathType(types[i]);
                if (map) Map.prototype.set.call(parent, key, child);
                else definePendingSlot(parent, key, child, descriptor);
            }
            parent = child;
        }
    }
    return value;
}

function overlayPendingPathCopy(value: any, path: string[], types: TypeAtPath[], next: any) {
    const copy = (current: any, index: number): any => {
        const prototype = Object.getPrototypeOf(current);
        const map = prototype === Map.prototype;
        const array = isArray(current);
        // Class instances keep their identity and take the write in place, as setAtPath did.
        if (!map && !array && prototype !== Object.prototype && prototype !== null) return current;
        const descriptors = Object.getOwnPropertyDescriptors(current);
        const key = path[index];
        const descriptor =
            !map && Object.prototype.hasOwnProperty.call(descriptors, key) ? descriptors[key] : undefined;
        if (descriptor && !('value' in descriptor)) return;
        let child: any;
        if (index < path.length - 1) {
            child = map ? Map.prototype.get.call(current, key) : descriptor?.value;
            if (child !== null && child !== undefined) {
                child = copy(child, index + 1);
                if (child === undefined) return;
            } else child = internal.initializePathType(types[index]);
        }
        const out = map ? new Map() : array ? Object.setPrototypeOf([], prototype) : Object.create(prototype);
        if (map) Map.prototype.forEach.call(current, (item: any, key: any) => Map.prototype.set.call(out, key, item));
        else if (descriptor) descriptors[key] = { ...descriptor, configurable: true, writable: true };
        // A frozen array's length would block restoring an index past its end.
        if (array) descriptors.length = { ...descriptors.length, writable: true };
        Object.defineProperties(out, descriptors);
        if (index < path.length - 1) {
            if (map) Map.prototype.set.call(out, key, child);
            else
                Object.defineProperty(out, key, {
                    value: child,
                    enumerable: descriptor?.enumerable ?? true,
                    configurable: true,
                    writable: true,
                });
        }
        return out;
    };
    try {
        const owned = copy(value, 0);
        return owned === undefined ? undefined : overlayPendingPath(owned, path, types, next);
    } catch {
        return;
    }
}

function pendingHistoryPath(
    before: any,
    current: any,
    path: (string | number)[],
    node: NodeInfo,
    fieldId?: string,
    canonical = false,
): { path: (string | number)[]; previous: any } | undefined {
    const out: (string | number)[] = [];
    try {
        for (const part of path) {
            let key = part;
            if (isArray(current)) {
                const idKey = (out.length === 0 && fieldId) || findIDKey(current[0], node);
                if (!idKey) return { path: out, previous: before };
                const getId = isFunction(idKey) ? idKey : (value: any) => value?.[idKey];
                const row = current[part as number];
                key = getId(row);
                if (typeof key !== 'string' && typeof key !== 'number') return;
                before = isArray(before) ? before.find((value) => getId(value) === key) : undefined;
                current = row;
            } else if (current instanceof Map) {
                if (!canonical && typeof key === 'string' && String(Number(key)) === key && current.has(Number(key))) {
                    if (current.has(key)) return;
                    key = Number(key);
                }
                before = before instanceof Map ? before.get(key) : undefined;
                current = current.get(key);
            } else {
                before = before?.[key];
                current = current?.[key];
            }
            out.push(key);
        }
        return { path: out, previous: before };
    } catch {
        return;
    }
}

function addPendingHistory(
    entry: PendingChanges[string],
    before: any,
    overwritten: any,
    path: (string | number)[],
    node: NodeInfo,
    fieldId?: string,
    keys?: Set<string>,
    depth = 0,
): Set<string> | undefined {
    if (!entry.h || before === overwritten || deepEqual(before, overwritten)) return keys;
    return addChangedPendingHistory(entry, before, overwritten, path, node, fieldId, keys, depth);
}

function addChangedPendingHistory(
    entry: PendingChanges[string],
    before: any,
    overwritten: any,
    path: (string | number)[],
    node: NodeInfo,
    fieldId?: string,
    keys?: Set<string>,
    depth = 0,
): Set<string> | undefined {
    try {
        if (depth > 100) return markPendingHistory(entry, path, keys);
        const prototype = before && Object.getPrototypeOf(before);
        if (prototype !== (overwritten && Object.getPrototypeOf(overwritten))) {
            const historyLength = entry.h!.length;
            const overwrittenPrototype = overwritten && Object.getPrototypeOf(overwritten);
            if ((before && typeof before === 'object') || (overwritten && typeof overwritten === 'object')) {
                for (const value of [before, overwritten]) {
                    const valuePrototype = value === before ? prototype : overwrittenPrototype;
                    const empty =
                        valuePrototype === Object.prototype
                            ? {}
                            : valuePrototype === Map.prototype
                              ? new Map()
                              : valuePrototype === Array.prototype
                                ? []
                                : undefined;
                    if (empty) keys = addPendingHistory(entry, empty, value, path, node, fieldId, keys, depth + 1);
                }
            }
            if (entry.h?.length === historyLength) keys = markPendingHistory(entry, path, keys);
            return keys;
        }
        if (prototype === Array.prototype)
            return addArrayPendingHistory(entry, before, overwritten, path, node, fieldId, keys, depth);
        if (prototype === Map.prototype) {
            if (
                [...before.keys(), ...overwritten.keys()].some(
                    (key) => typeof key !== 'string' && typeof key !== 'number',
                )
            ) {
                entry.h = undefined;
                return keys;
            }
            return addKeyedPendingHistory(entry, before, overwritten, path, node, keys, depth);
        }
        if (prototype === Object.prototype || prototype === null)
            return addPendingRecordHistory(entry, before, overwritten, path, node, keys, depth);
        return markPendingHistory(entry, path, keys);
    } catch {
        entry.h = undefined;
    }
    return keys;
}

function addArrayPendingHistory(
    entry: PendingChanges[string],
    before: any[],
    overwritten: any[],
    path: (string | number)[],
    node: NodeInfo,
    fieldId: string | undefined,
    keys: Set<string> | undefined,
    depth: number,
): Set<string> | undefined {
    const idKey = fieldId || findIDKey(before[0] || overwritten[0], node);
    if (!idKey) return markPendingHistory(entry, path, keys);
    const getId = isFunction(idKey) ? idKey : (value: any) => value?.[idKey];
    const index = (rows: any[]) => {
        const out = new Map<string | number, any>();
        for (const row of rows) {
            const id = getId(row);
            if ((typeof id !== 'string' && typeof id !== 'number') || out.has(id)) return;
            out.set(id, row);
        }
        return out;
    };
    const indexedA = index(before);
    const ids = indexedA ? Array.from(indexedA.keys()) : [];
    let indexedB: Map<string | number, any> | undefined;
    const rows: any[] = [];
    let aligned = !!indexedA;
    for (const row of overwritten) {
        const i = rows.length;
        rows.push(row);
        const id = getId(row);
        if (typeof id !== 'string' && typeof id !== 'number') {
            entry.h = undefined;
            return keys;
        }
        if (!indexedB && aligned && id === ids[i]) continue;
        if (!indexedB) {
            indexedB = new Map();
            for (let j = 0; j < i; j++) indexedB.set(ids[j], rows[j]);
        }
        aligned = false;
        if (indexedB.has(id)) {
            entry.h = undefined;
            return keys;
        }
        indexedB.set(id, row);
    }
    if (!indexedA) {
        entry.h = undefined;
        return keys;
    }
    if (aligned && rows.length === ids.length) {
        for (let i = 0; i < ids.length; i++) {
            const beforeValue = indexedA.get(ids[i]);
            const overwrittenValue = rows[i];
            if (entry.h && beforeValue !== overwrittenValue && !deepEqual(beforeValue, overwrittenValue))
                keys = addChangedPendingHistory(
                    entry,
                    beforeValue,
                    overwrittenValue,
                    [...path, ids[i]],
                    node,
                    undefined,
                    keys,
                    depth + 1,
                );
        }
        return keys;
    }
    keys = markPendingHistory(entry, path, keys);
    return addKeyedPendingHistory(
        entry,
        indexedA,
        indexedB || new Map(ids.slice(0, rows.length).map((id, i) => [id, rows[i]])),
        path,
        node,
        keys,
        depth,
    );
}

function addKeyedPendingHistory(
    entry: PendingChanges[string],
    a: Map<string | number, any>,
    b: Map<string | number, any>,
    path: (string | number)[],
    node: NodeInfo,
    keys: Set<string> | undefined,
    depth: number,
): Set<string> | undefined {
    for (const key of new Set([...a.keys(), ...b.keys()])) {
        const beforeValue = a.get(key);
        const overwrittenValue = b.get(key);
        keys = addPendingHistory(
            entry,
            beforeValue,
            overwrittenValue,
            [...path, key],
            node,
            undefined,
            keys,
            depth + 1,
        );
        if (a.has(key) !== b.has(key) && beforeValue === undefined && overwrittenValue === undefined)
            keys = markPendingHistory(entry, [...path, key], keys);
    }
    return keys;
}

function addPendingRecordHistory(
    entry: PendingChanges[string],
    before: any,
    overwritten: any,
    path: (string | number)[],
    node: NodeInfo,
    keys: Set<string> | undefined,
    depth: number,
): Set<string> | undefined {
    if (
        [before, overwritten].some((value) =>
            Object.getOwnPropertySymbols(value).some((key) => Object.prototype.propertyIsEnumerable.call(value, key)),
        )
    ) {
        entry.h = undefined;
        return keys;
    }
    const beforeKeys = Object.keys(before);
    const beforeValues = beforeKeys.map((key) => before[key]);
    const overwrittenKeys = Object.keys(overwritten);
    const overwrittenValues = overwrittenKeys.map((key) => overwritten[key]);
    if (beforeKeys.length === overwrittenKeys.length && beforeKeys.every((key, i) => key === overwrittenKeys[i])) {
        for (let i = 0; i < beforeKeys.length; i++) {
            const beforeValue = beforeValues[i];
            const overwrittenValue = overwrittenValues[i];
            if (entry.h && beforeValue !== overwrittenValue && !deepEqual(beforeValue, overwrittenValue))
                keys = addChangedPendingHistory(
                    entry,
                    beforeValue,
                    overwrittenValue,
                    [...path, beforeKeys[i]],
                    node,
                    undefined,
                    keys,
                    depth + 1,
                );
        }
        return keys;
    }
    const a = new Map(beforeKeys.map((key, i) => [key, beforeValues[i]]));
    const b = new Map(overwrittenKeys.map((key, i) => [key, overwrittenValues[i]]));
    return addKeyedPendingHistory(entry, a, b, path, node, keys, depth);
}

function pendingHistoryTree(history: PendingChanges[string]['h']): PendingHistoryTree | undefined {
    if (!history) return unknownPendingHistory;
    if (!history.length) return;
    const cached = pendingHistoryCaches.get(history);
    if (cached?.treeLength === history.length) return cached.tree;
    const root: PendingHistoryTree = {};
    for (const path of history) {
        let tree = root;
        for (const key of path) {
            tree.children ||= new Map();
            let child = tree.children.get(key);
            if (!child) tree.children.set(key, (child = {}));
            tree = child;
        }
    }
    if (cached) {
        cached.tree = root;
        cached.treeLength = history.length;
    } else pendingHistoryCaches.set(history, { tree: root, treeLength: history.length });
    return root;
}

function getPendingSnapshotKeys(
    descriptors: PropertyDescriptorMap,
    array: boolean,
    length: number,
): PropertyKey[] | undefined {
    const keys = Reflect.ownKeys(descriptors);
    let count = 0;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const descriptor = descriptors[key];
        if (
            descriptor.enumerable ||
            (array && typeof key === 'string' && key === String(parseInt(key, 10)) && +key >= 0 && +key < length)
        ) {
            if (!('value' in descriptor)) return;
            keys[count++] = key;
        }
    }
    keys.length = count;
    return keys;
}

type DetachedSnapshot = { seen: Set<object>; supported: boolean };

// The detached case of snapshotPendingLocal's visit, kept small because it visits every pending row.
export function snapshotDetachedValue(value: any, state: DetachedSnapshot): any {
    if (!value || typeof value !== 'object') return value;
    if (state.seen.has(value)) {
        state.supported = false;
        return;
    }
    state.seen.add(value);
    try {
        const prototype = Object.getPrototypeOf(value);
        const descriptors: Record<PropertyKey, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value);
        const array = prototype === Array.prototype;
        const map = prototype === Map.prototype;
        const date = prototype === Date.prototype;
        const record = prototype === Object.prototype || prototype === null;
        if (!array && !map && !date && !record && prototype !== Set.prototype) {
            state.supported = false;
            return;
        }
        const length = array ? descriptors.length.value : 0;
        const keys = getPendingSnapshotKeys(descriptors, array, length);
        if (!keys) {
            state.supported = false;
            return;
        }
        const out = record
            ? Object.create(null)
            : array
              ? new Array(length)
              : date
                ? new Date(Date.prototype.getTime.call(value))
                : snapshotDetachedCollection(value, map, state);
        for (const key of keys) {
            const next = snapshotDetachedValue(descriptors[key as any].value, state);
            if (record) out[key] = next;
            else Object.defineProperty(out, key, { value: next, enumerable: true, configurable: true, writable: true });
        }
        if (array) out.length = length;
        if (prototype === Object.prototype) Object.setPrototypeOf(out, prototype);
        return out;
    } catch {
        state.supported = false;
        return;
    } finally {
        state.seen.delete(value);
    }
}

function snapshotDetachedCollection(value: any, map: boolean, state: DetachedSnapshot): Map<any, any> | Set<any> {
    if (!map) {
        return new Set(Array.from(Set.prototype.values.call(value), (item) => snapshotDetachedValue(item, state)));
    }
    const out = new Map();
    for (const [key, item] of Map.prototype.entries.call(value)) {
        Map.prototype.set.call(out, key, snapshotDetachedValue(item, state));
    }
    return out;
}

function snapshotPendingLocal(value: any, wire: any): any {
    if (wire === undefined) {
        const state: DetachedSnapshot = { seen: new Set(), supported: true };
        const result = snapshotDetachedValue(value, state);
        return state.supported ? result : undefined;
    }
    let supported = true;
    const seen = new Set<object>();
    const visit = (value: any, wire: any): any => {
        if (Object.is(value, wire) || !value || typeof value !== 'object') return value;
        if (seen.has(value)) {
            supported = false;
            return wire;
        }
        seen.add(value);
        try {
            const prototype = Object.getPrototypeOf(value);
            const wirePrototype = wire && typeof wire === 'object' ? Object.getPrototypeOf(wire) : undefined;
            const descriptors: Record<PropertyKey, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value);
            const wireDescriptors: Record<PropertyKey, PropertyDescriptor> =
                wire && typeof wire === 'object' ? Object.getOwnPropertyDescriptors(wire) : {};
            const array = prototype === Array.prototype;
            const map = prototype === Map.prototype;
            const set = prototype === Set.prototype;
            const date = prototype === Date.prototype;
            if (!array && !map && !set && !date && prototype !== Object.prototype && prototype !== null) {
                supported = false;
                return wire;
            }
            const length = array ? descriptors.length.value : 0;
            const valueKeys = getPendingSnapshotKeys(descriptors, array, length);
            const wireLength = array && wirePrototype === Array.prototype ? wireDescriptors.length.value : 0;
            const wireKeys = getPendingSnapshotKeys(wireDescriptors, array, wireLength);
            if (!valueKeys || !wireKeys) {
                supported = false;
                return wire;
            }
            let out =
                wirePrototype === prototype && (!array || wireLength === length)
                    ? wire
                    : map
                      ? new Map()
                      : set
                        ? new Set()
                        : date
                          ? new Date(Date.prototype.getTime.call(value))
                          : array
                            ? new Array(length)
                            : Object.create(prototype);
            const copy = () => {
                if (out === wire) {
                    out = map
                        ? new Map(Map.prototype.entries.call(wire))
                        : set
                          ? new Set(Set.prototype.values.call(wire))
                          : date
                            ? new Date(Date.prototype.getTime.call(wire))
                            : array
                              ? new Array(length)
                              : Object.create(prototype);
                    for (const key of wireKeys)
                        Object.defineProperty(out, key, {
                            value: wireDescriptors[key].value,
                            enumerable: true,
                            configurable: true,
                            writable: true,
                        });
                }
                return out;
            };
            if (map) {
                for (const [key, item] of Map.prototype.entries.call(value)) {
                    const has = wirePrototype === Map.prototype && Map.prototype.has.call(wire, key);
                    const previous = has ? Map.prototype.get.call(wire, key) : undefined;
                    const next = visit(item, previous);
                    if (!has || next !== previous) Map.prototype.set.call(copy(), key, next);
                }
                if (wirePrototype === Map.prototype)
                    for (const key of Map.prototype.keys.call(wire))
                        if (!Map.prototype.has.call(value, key)) Map.prototype.delete.call(copy(), key);
            } else if (set) {
                const previous = wirePrototype === Set.prototype ? Array.from(Set.prototype.values.call(wire)) : [];
                const next = Array.from(Set.prototype.values.call(value), (item, i) =>
                    visit(item, i < previous.length ? previous[i] : undefined),
                );
                if (next.length !== previous.length || next.some((item, i) => item !== previous[i]))
                    out = new Set(next);
            } else if (
                date &&
                (wirePrototype !== Date.prototype ||
                    Date.prototype.getTime.call(value) !== Date.prototype.getTime.call(wire))
            ) {
                out = new Date(Date.prototype.getTime.call(value));
            }
            for (const key of valueKeys) {
                const previous = Object.prototype.hasOwnProperty.call(wireDescriptors, key)
                    ? wireDescriptors[key]
                    : undefined;
                const next = visit(descriptors[key].value, previous?.value);
                if (!previous || next !== previous.value || out !== wire)
                    Object.defineProperty(copy(), key, {
                        value: next,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    });
            }
            for (const key of wireKeys) if (!Object.prototype.hasOwnProperty.call(descriptors, key)) delete copy()[key];
            if (array && out !== wire) out.length = length;
            return out;
        } catch {
            supported = false;
            return wire;
        } finally {
            seen.delete(value);
        }
    };
    const result = visit(value, wire);
    return supported ? result : undefined;
}

function clonePendingValue(value: any, seen?: Map<object, any>): any {
    if (!value || typeof value !== 'object') return value;
    seen ||= new Map();
    if (seen.has(value)) return seen.get(value);
    let prototype: any;
    let keys: PropertyKey[];
    try {
        prototype = Object.getPrototypeOf(value);
        keys = Reflect.ownKeys(value);
    } catch {
        return clone(value);
    }
    const array = isArray(value);
    const record = !array && (prototype === Object.prototype || prototype === null);
    return record
        ? clonePendingRecord(value, prototype, keys, seen)
        : clonePendingOther(value, prototype, keys, seen, array);
}

function clonePendingRecord(value: any, prototype: any, keys: PropertyKey[], seen: Map<object, any>): any {
    const out = Object.create(null);
    seen.set(value, out);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (Object.prototype.propertyIsEnumerable.call(value, key)) {
            let item = value[key];
            if (item && typeof item === 'object') item = clonePendingValue(item, seen);
            out[key] = item;
        }
    }
    if (prototype === Object.prototype) Object.setPrototypeOf(out, prototype);
    return out;
}

function clonePendingOther(
    value: any,
    prototype: any,
    keys: PropertyKey[],
    seen: Map<object, any>,
    array: boolean,
): any {
    let out: any;
    let arrayPrototype: any;
    if (array) {
        out = new Array(value.length);
        arrayPrototype = Object.getPrototypeOf(out);
        Object.setPrototypeOf(out, null);
    } else if (prototype === Map.prototype) out = new Map();
    else if (prototype === Set.prototype) out = new Set();
    else if (prototype === Date.prototype) out = new Date(value);
    else return clone(value);
    seen.set(value, out);
    let start = 0;
    if (prototype === Map.prototype) {
        Map.prototype.forEach.call(value, (item: any, key: any) => out.set(key, clonePendingValue(item, seen)));
    } else if (prototype === Set.prototype) {
        Set.prototype.forEach.call(value, (item: any) => out.add(clonePendingValue(item, seen)));
    } else if (array && keys[out.length] === 'length') {
        // Own keys list every index before length only when the array has no holes.
        for (; start < out.length; start++) {
            let item = value[start];
            if (item && typeof item === 'object') item = clonePendingValue(item, seen);
            out[start] = item;
        }
        start++;
    }
    for (let i = start; i < keys.length; i++) {
        const key = keys[i];
        if (
            Object.prototype.propertyIsEnumerable.call(value, key) ||
            (array && typeof key === 'string' && key === String(parseInt(key, 10)) && +key >= 0 && +key < value.length)
        ) {
            let item = value[key];
            if (item && typeof item === 'object') item = clonePendingValue(item, seen);
            if (array) out[key] = item;
            else
                Object.defineProperty(out, key, {
                    value: item,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
        }
    }
    if (array) Object.setPrototypeOf(out, arrayPrototype);
    return out;
}

function setPendingRootValue(previous: any, value: any, parent?: any, key?: any): any {
    const observableValue = isObservable(value);
    if (observableValue) {
        value = value.peek();
        if (isFunction(value)) return previous;
    }
    const deleted = value === internal.symbolDelete;
    if (deleted) value = undefined;
    const map = isMap(parent);
    const set = isSet(parent);
    previous = set ? key : previous;
    if (!observableValue && isFunction(value) && !isFunction(previous)) value = value(previous);
    if (parent && value !== previous) {
        if (deleted) {
            if (map || set) parent.delete(key);
            else delete parent[key];
        } else if (map) parent.set(key, value);
        else if (set) parent.add(value);
        else Object.defineProperty(parent, key, { value, enumerable: true, configurable: true, writable: true });
    }
    return value;
}

function mergePendingRootValue(target: any, source: any, levelsDeep = 0, parent?: any, key?: any): any {
    if (isObservable(source)) source = source.peek();
    const targetArray = isArray(target);
    if (isSet(source) && isSet(target)) {
        return setPendingRootValue(target, new Set([...source, ...target]), parent, key);
    }
    if ((!targetArray && isObject(target) && isObject(source)) || (targetArray && target.length > 0)) {
        const sourceMap = isMap(source);
        const sourceSet = isSet(source);
        const keys: any[] = sourceMap || sourceSet ? Array.from(source.keys()) : Object.keys(source);
        const targetMap = isMap(target);
        const targetSet = isSet(target);
        for (const childKey of keys) {
            const value = sourceSet ? childKey : sourceMap ? source.get(childKey) : source[childKey];
            const current = targetMap
                ? target.get(childKey)
                : Object.prototype.hasOwnProperty.call(target, childKey)
                  ? (target as any)[childKey]
                  : undefined;
            if (value === internal.symbolDelete) {
                if (targetArray) target.splice(childKey, 1);
                else if (targetMap || targetSet) target.delete(childKey);
                else delete target[childKey];
            } else {
                const object = isObject(value);
                const array = !object && isArray(value);
                if (
                    (object || array) &&
                    !(array && Object.keys(value).length >= (value as any[]).length) &&
                    !(object && levelsDeep > 0 && isEmpty(value))
                ) {
                    mergePendingRootValue(current, value, levelsDeep + 1, target, childKey);
                } else {
                    setPendingRootValue(current, value, target, childKey);
                }
            }
        }
        return target;
    }
    return source === undefined ? target : setPendingRootValue(target, source, parent, key);
}

function normalizePendingRoot(previous: any, incoming: any, mode: GetMode, node: NodeInfo, fieldId?: string): any {
    try {
        if (mode === 'append' || mode === 'prepend' || (mode === 'merge' && isArray(previous) && isArray(incoming))) {
            if (!isArray(previous) || !isArray(incoming)) return incoming;
            const idKey = fieldId || findIDKey(previous[0] || incoming[0], node);
            if (!idKey && mode !== 'merge')
                return mode === 'prepend' ? incoming.concat(previous) : previous.concat(incoming);
            if (idKey) {
                const getId = isFunction(idKey) ? idKey : (value: any) => value?.[idKey];
                const rows: any[] = mode === 'merge' ? [] : previous.slice();
                const indices = new Map();
                let length = previous.length;
                for (let i = 0; i < previous.length; i++) {
                    const id = getId(previous[i]);
                    if (!isNullOrUndefined(id) && !indices.has(id)) indices.set(id, i);
                }
                for (const row of incoming) {
                    if (row === internal.symbolDelete) continue;
                    const id = getId(row);
                    let index = isNullOrUndefined(id) ? undefined : indices.get(id);
                    if (index === undefined) {
                        index = length++;
                        if (!isNullOrUndefined(id)) indices.set(id, index);
                    }
                    rows[index] = row;
                }
                if (mode !== 'merge') return mode === 'prepend' ? rows.splice(previous.length).concat(rows) : rows;
                incoming = rows;
            }
        }
        if (mode === 'merge') {
            return mergePendingRootValue(clonePendingValue(previous), incoming);
        }
        if (mode !== 'assign') return incoming;
        if (incoming === undefined || incoming === null) return previous;
        const map = previous instanceof Map && incoming instanceof Map;
        if (
            !map &&
            !(
                isObject(previous) &&
                isObject(incoming) &&
                Object.getPrototypeOf(previous) === Object.prototype &&
                Object.getPrototypeOf(incoming) === Object.prototype
            )
        )
            return incoming;
        const out: any = map ? new Map(previous) : { ...previous };
        const keys = map
            ? incoming.keys()
            : Reflect.ownKeys(incoming).filter((key) => Object.prototype.propertyIsEnumerable.call(incoming, key));
        for (const key of keys) {
            const value = map ? incoming.get(key) : (incoming as Record<PropertyKey, any>)[key];
            if (value === internal.symbolDelete) {
                if (map) out.delete(key);
                else delete out[key];
            } else if (map) out.set(key, value);
            else Object.defineProperty(out, key, { value, enumerable: true, configurable: true, writable: true });
        }
        return out;
    } catch {
        return previous;
    }
}

const detachedAssignBaselines = new WeakSet<object>();

function reconcilePendingAssign(entry: PendingChanges[string], current: any, delta: any, node: NodeInfo) {
    try {
        const previous = entry.p;
        if (!entry.h) return;
        const values = [previous, current, delta];
        const map = values.every((value) => value && Object.getPrototypeOf(value) === Map.prototype);
        if (!map && !values.every((value) => value && Object.getPrototypeOf(value) === Object.prototype)) return;
        const keys = (value: any): any[] =>
            map
                ? Array.from(value.keys())
                : Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
        const currentKeys = keys(current);
        const previousKeys = keys(previous);
        if (
            currentKeys.length !== previousKeys.length ||
            currentKeys.some((key, i) => !Object.is(key, previousKeys[i]))
        )
            return;
        const changedKeys = keys(delta);
        if (changedKeys.some((key) => key === '_' || (typeof key !== 'string' && typeof key !== 'number'))) return;
        const has = (value: any, key: any) => (map ? value.has(key) : Object.prototype.hasOwnProperty.call(value, key));
        const get = (value: any, key: any) => (map ? value.get(key) : value[key]);
        const put = (value: any, key: any, item: any) => {
            if (map) value.set(key, item);
            else
                Object.defineProperty(value, key, {
                    value: item,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
        };
        const selectedPrevious: any = map ? new Map() : {};
        const selectedCurrent: any = map ? new Map() : {};
        const selectedRemote: any = map ? new Map() : {};
        let baseline: any = map ? new Map(previous) : { ...previous };
        const detached = detachedAssignBaselines.has(previous);
        let historyKeys: Set<string> | undefined;
        for (const key of changedKeys) {
            const value = get(delta, key);
            const before = get(previous, key);
            const local = get(current, key);
            if (has(previous, key)) put(selectedPrevious, key, before);
            if (has(current, key)) put(selectedCurrent, key, local);
            historyKeys = addPendingHistory(entry, before, local, [key], node, undefined, historyKeys);
            if (has(previous, key) !== has(current, key) && before === undefined && local === undefined)
                historyKeys = markPendingHistory(entry, [key], historyKeys);
            if (value === internal.symbolDelete) {
                if (map) baseline.delete(key);
                else delete baseline[key];
            } else {
                put(selectedRemote, key, value);
                put(baseline, key, detached ? clonePendingValue(value) : value);
            }
        }
        if (!entry.h) return;
        if (!detached) baseline = clonePendingValue(baseline);
        const history = pendingHistoryTree(entry.h);
        let selectedHistory: PendingHistoryTree | undefined;
        for (const key of changedKeys) {
            const child = history?.children?.get(key);
            if (child) {
                selectedHistory ||= { children: new Map() };
                selectedHistory.children!.set(key, child);
            }
        }
        const patch = mergePendingValue(
            selectedRemote,
            selectedCurrent,
            selectedPrevious,
            node,
            undefined,
            selectedHistory,
            true,
        );
        for (const key of changedKeys) {
            if (!has(patch, key) && has(current, key)) put(patch, key, internal.symbolDelete);
            else if (has(patch, key) && has(current, key) && get(patch, key) === get(current, key)) {
                if (map) patch.delete(key);
                else delete patch[key];
            }
        }
        detachedAssignBaselines.add(baseline);
        return { baseline, patch };
    } catch {
        return;
    }
}

function getPendingRecordPrototype(value: any): object | null | undefined {
    if (!value || typeof value !== 'object') return;
    try {
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null ? prototype : undefined;
    } catch {
        return;
    }
}

// Keep server-added fields while pending replacements retain arrays, sets, and known removals.
function mergePendingValue(
    remote: any,
    pending: any,
    previous: any,
    node?: NodeInfo,
    fieldId?: string,
    history?: PendingHistoryTree,
    complete?: boolean,
): any {
    if (history?.unknown) return pending;
    if (remote === undefined || remote === pending) return pending;
    if (fieldId && !isArray(pending) && remote?.[fieldId] !== pending?.[fieldId]) return pending;
    if (!node && deepEqual(remote, previous)) return pending;
    return mergeChangedPendingValue(remote, pending, previous, node, fieldId, history, complete);
}

function mergeChangedPendingValue(
    remote: any,
    pending: any,
    previous: any,
    node?: NodeInfo,
    fieldId?: string,
    history?: PendingHistoryTree,
    complete?: boolean,
): any {
    if (node && isArray(remote) && isArray(pending)) {
        const idKey = fieldId || findIDKey(pending[0], node);
        if (idKey) return mergePendingArrayById(remote, pending, previous, idKey, history, complete);
    }
    let mergeRootObject = false;
    if (node) {
        try {
            mergeRootObject = [remote, pending, previous].every(
                (value) =>
                    value &&
                    Object.getPrototypeOf(value) === Object.prototype &&
                    !Object.getOwnPropertySymbols(value).some((key) =>
                        Object.prototype.propertyIsEnumerable.call(value, key),
                    ),
            );
        } catch {
            mergeRootObject = false;
        }
    }
    return mergeRootObject
        ? mergePendingRootRecord(remote, pending, previous, history, complete)
        : mergePendingRemainder(remote, pending, previous, node, history, complete);
}

// Separate shapes keep each hot merge loop small for the JIT.
function mergePendingArrayById(
    remote: any,
    pending: any,
    previous: any,
    idKey: string | ((value: any) => string | number),
    history: PendingHistoryTree | undefined,
    complete: boolean | undefined,
): any {
    const getId = isFunction(idKey) ? idKey : (value: any) => value?.[idKey];
    let aligned = isArray(previous) && remote.length === pending.length && previous.length === pending.length;
    let alignedValues: any[] | undefined;
    for (let i = 0; aligned && i < pending.length; i++) {
        const value = pending[i];
        const id = isNullOrUndefined(value) ? undefined : getId(value);
        aligned =
            !isNullOrUndefined(id) &&
            !isNullOrUndefined(remote[i]) &&
            !isNullOrUndefined(previous[i]) &&
            id === getId(remote[i]) &&
            id === getId(previous[i]);
        if (aligned) {
            const mergedValue = mergePendingValue(
                remote[i],
                value,
                previous[i],
                undefined,
                undefined,
                history?.children?.get(id),
                complete,
            );
            if (!alignedValues && mergedValue !== value) alignedValues = pending.slice(0, i);
            alignedValues?.push(mergedValue);
        }
    }
    if (aligned) return alignedValues || pending;
    if (deepEqual(remote, previous)) return pending;
    if (!history && deepEqual(pending, previous)) return remote;
    const index = (values: any[]) => {
        const out = new Map();
        for (const value of values) {
            const id = isNullOrUndefined(value) ? undefined : getId(value);
            if (!isNullOrUndefined(id)) out.set(id, value);
        }
        return out;
    };
    const remoteById = index(remote);
    const previousById = index(isArray(previous) ? previous : []);
    const merged: any[] = [];
    for (let i = 0; i < pending.length; i++) {
        if (!(i in pending)) {
            merged.length++;
            continue;
        }
        const value = pending[i];
        const id = isNullOrUndefined(value) ? undefined : getId(value);
        if (
            complete &&
            !isNullOrUndefined(id) &&
            !remoteById.has(id) &&
            previousById.has(id) &&
            !history?.children?.has(id) &&
            deepEqual(value, previousById.get(id))
        )
            continue;
        merged.push(
            isNullOrUndefined(id)
                ? value
                : mergePendingValue(
                      remoteById.get(id),
                      value,
                      previousById.get(id),
                      undefined,
                      undefined,
                      history?.children?.get(id),
                      complete,
                  ),
        );
    }
    const pendingById = index(pending);
    for (const value of remote) {
        const id = isNullOrUndefined(value) ? undefined : getId(value);
        if (!isNullOrUndefined(id) && !previousById.has(id) && !pendingById.has(id) && !history?.children?.has(id))
            merged.push(value);
    }
    return deepEqual(merged, pending) ? pending : merged;
}

function mergePendingRootRecord(
    remote: any,
    pending: any,
    previous: any,
    history: PendingHistoryTree | undefined,
    complete: boolean | undefined,
): any {
    if (!history && deepEqual(pending, previous)) return deepEqual(remote, pending) ? pending : remote;
    let merged: any;
    const setKey = (key: string, value: any) => {
        merged ||= { ...pending };
        Object.defineProperty(merged, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
        });
    };
    for (const key of Object.keys(remote)) {
        if (
            !Object.prototype.hasOwnProperty.call(pending, key) &&
            !Object.prototype.hasOwnProperty.call(previous, key) &&
            !history?.children?.has(key)
        ) {
            setKey(key, remote[key]);
        }
    }
    for (const key of Object.keys(pending)) {
        if (
            complete &&
            (remote[key] === undefined || !Object.prototype.hasOwnProperty.call(remote, key)) &&
            Object.prototype.hasOwnProperty.call(previous, key) &&
            !history?.children?.has(key) &&
            deepEqual(pending[key], previous[key])
        ) {
            if (Object.prototype.hasOwnProperty.call(remote, key)) {
                if (pending[key] !== undefined) setKey(key, undefined);
            } else {
                merged ||= { ...pending };
                delete merged[key];
            }
            continue;
        }
        const value = mergePendingValue(
            remote[key],
            pending[key],
            previous[key],
            undefined,
            undefined,
            history?.children?.get(key),
            complete,
        );
        if (value !== pending[key]) setKey(key, value);
    }
    return merged || pending;
}

function mergePendingRemainder(
    remote: any,
    pending: any,
    previous: any,
    node: NodeInfo | undefined,
    history: PendingHistoryTree | undefined,
    complete: boolean | undefined,
): any {
    if ((node && deepEqual(remote, previous)) || deepEqual(remote, pending)) return pending;
    if (!history && deepEqual(pending, previous)) return remote;
    const remotePrototype = getPendingRecordPrototype(remote);
    const pendingPrototype = remotePrototype === undefined ? undefined : getPendingRecordPrototype(pending);
    if (pendingPrototype !== undefined) {
        const merged = Object.setPrototypeOf({ ...remote }, pendingPrototype);
        if (getPendingRecordPrototype(previous) !== undefined) {
            for (const key of Object.keys(previous)) {
                if (!Object.prototype.hasOwnProperty.call(pending, key)) delete merged[key];
            }
        }
        for (const key of history?.children?.keys() || []) {
            if (!Object.prototype.hasOwnProperty.call(pending, key)) delete merged[key];
        }
        for (const key of Object.keys(pending)) {
            if (
                complete &&
                (remote[key] === undefined || !Object.prototype.hasOwnProperty.call(remote, key)) &&
                Object.prototype.hasOwnProperty.call(previous || {}, key) &&
                !history?.children?.has(key) &&
                deepEqual(pending[key], previous[key])
            )
                continue;
            Object.defineProperty(merged, key, {
                value: mergePendingValue(
                    remote[key],
                    pending[key],
                    previous?.[key],
                    undefined,
                    undefined,
                    history?.children?.get(key),
                    complete,
                ),
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        return deepEqual(merged, pending) ? pending : merged;
    }
    if (remote instanceof Map && pending instanceof Map) {
        const merged = new Map(remote);
        if (previous instanceof Map) {
            for (const key of previous.keys()) {
                if (!pending.has(key)) merged.delete(key);
            }
        }
        for (const key of history?.children?.keys() || []) {
            if (!pending.has(key)) merged.delete(key);
        }
        for (const [key, value] of pending) {
            if (
                complete &&
                (remote.get(key) === undefined || !remote.has(key)) &&
                previous instanceof Map &&
                previous.has(key) &&
                !history?.children?.has(key) &&
                deepEqual(value, previous.get(key))
            )
                continue;
            merged.set(
                key,
                mergePendingValue(
                    remote.get(key),
                    value,
                    previous instanceof Map ? previous.get(key) : undefined,
                    undefined,
                    undefined,
                    history?.children?.get(key),
                    complete,
                ),
            );
        }
        return deepEqual(merged, pending) ? pending : merged;
    }
    return pending;
}

type PendingAckScope = { path: (string | number)[]; sent: any; sentExists: boolean; saved: any; exists: boolean };

function acknowledgePendingRoot(
    original: PendingChanges[string],
    current: any,
    sent: any,
    changes: ChangeWithPathStr[],
    failed: Set<string>,
    returned: any,
    pending: PendingChanges,
    node: NodeInfo,
    fieldId?: string,
): boolean {
    try {
        const entry = { ...original, h: original.h?.slice() };
        const record = (value: any) =>
            value instanceof Map ||
            (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
        if (!record(entry.p) || !record(current) || !record(sent)) return false;
        const at = (value: any, path: readonly (string | number)[]) => {
            let exists = true;
            for (const key of path) {
                if (!record(value))
                    return { exists: false, value: undefined, supported: value === undefined || value === null };
                exists = value instanceof Map ? value.has(key) : Object.prototype.hasOwnProperty.call(value, key);
                value = exists ? (value instanceof Map ? value.get(key) : value[key]) : undefined;
            }
            return { exists, value, supported: true };
        };
        const normalize = (sent: any, returned: any, depth: number) => {
            const parent = { value: clonePendingValue(sent) };
            mergePendingRootValue(parent, { value: returned }, depth - 1);
            return parent.value;
        };
        const failedScopes = Array.from(failed)
            .filter(Boolean)
            .map((path) => pendingHistoryPath(entry.p, current, path.split('/'), node, fieldId)?.path);
        if (failedScopes.some((path) => !path)) return false;
        const overlapsFailure = (path: (string | number)[]) =>
            failedScopes.some((failedPath) =>
                failedPath!.slice(0, Math.min(path.length, failedPath!.length)).every((key, i) => key === path[i]),
            );
        const scopes: PendingAckScope[] = [];
        const rootChange = changes.find((change) => !change.path.length);
        if (rootChange) {
            const failedRoot = failed.has('');
            const acknowledged = failedRoot ? returned : sent;
            if (record(acknowledged)) {
                const keys = acknowledged instanceof Map ? acknowledged.keys() : Object.keys(acknowledged);
                for (const key of keys) {
                    if (overlapsFailure([key])) continue;
                    const sentAtPath = at(sent, [key]);
                    const savedAtPath = at(returned, [key]);
                    scopes.push({
                        path: [key],
                        sent: sentAtPath.value,
                        sentExists: sentAtPath.exists,
                        saved: savedAtPath.exists
                            ? normalize(sentAtPath.value, savedAtPath.value, 1)
                            : sentAtPath.value,
                        exists:
                            savedAtPath.value !== internal.symbolDelete && (sentAtPath.exists || savedAtPath.exists),
                    });
                }
                if (!failedRoot) {
                    const previousKeys = entry.p instanceof Map ? entry.p.keys() : Object.keys(entry.p);
                    for (const key of previousKeys) {
                        if (!at(sent, [key]).exists && !overlapsFailure([key]))
                            scopes.push({
                                path: [key],
                                sent: undefined,
                                sentExists: false,
                                saved: undefined,
                                exists: false,
                            });
                    }
                }
            }
        } else {
            for (const change of changes) {
                if (failed.has(change.pathStr)) continue;
                const path = pendingHistoryPath(entry.p, current, change.path, node, fieldId)?.path;
                if (
                    !path ||
                    path.length !== change.path.length ||
                    !at(current, path).supported ||
                    overlapsFailure(path)
                )
                    continue;
                const normalized = at(returned, path);
                const sentAtPath = at(sent, path);
                scopes.push({
                    path,
                    sent: change.valueAtPath === internal.symbolDelete ? undefined : change.valueAtPath,
                    sentExists: sentAtPath.exists && change.valueAtPath !== internal.symbolDelete,
                    saved: normalized.exists
                        ? normalize(change.valueAtPath, normalized.value, path.length)
                        : change.valueAtPath,
                    exists:
                        (sentAtPath.exists || normalized.exists) &&
                        change.valueAtPath !== internal.symbolDelete &&
                        normalized.value !== internal.symbolDelete,
                });
            }
        }
        if (!scopes.length) return false;
        for (const scope of scopes) {
            addPendingHistory(entry, at(entry.p, scope.path).value, at(current, scope.path).value, scope.path, node);
            if (original.h && !entry.h) return false;
        }
        const remaining = Object.keys(pending)
            .filter(Boolean)
            .map(
                (key) =>
                    pendingHistoryPath(
                        entry.p,
                        current,
                        pending[key].k || key.split('/'),
                        node,
                        fieldId,
                        !!pending[key].k,
                    )?.path,
            );
        const scopeByPath = new Map(scopes.map((scope) => [pendingHistoryKey(scope.path), scope]));
        const remainingTree = pendingHistoryTree(
            remaining.some((path) => !path) ? undefined : (remaining as PendingHistory),
        );
        if (entry.h)
            entry.h = entry.h.filter((path) => {
                let scope: PendingAckScope | undefined;
                let owned = remainingTree;
                for (let i = 0; i < path.length; i++) {
                    scope ||= scopeByPath.get(pendingHistoryKey(path.slice(0, i + 1)));
                    if (owned?.unknown || (owned && !owned.children)) return true;
                    owned = owned?.children?.get(path[i]);
                }
                if (!scope || owned) return true;
                const actual = at(current, path);
                const expected = at(scope.sent, path.slice(scope.path.length));
                return (
                    !actual.supported ||
                    !expected.supported ||
                    actual.exists !== (path.length === scope.path.length ? scope.sentExists : expected.exists) ||
                    !deepEqual(actual.value, expected.value)
                );
            });
        const set = (
            value: any,
            path: (string | number)[],
            saved: any,
            exists: boolean,
            root = false,
            template = current,
        ): any => {
            if (!record(value)) {
                if (!record(template)) return value;
                value = template instanceof Map ? new Map() : Object.create(Object.getPrototypeOf(template));
            }
            const out = root
                ? value
                : value instanceof Map
                  ? new Map(value)
                  : Object.setPrototypeOf({ ...value }, Object.getPrototypeOf(value));
            const key = path[0];
            const next =
                path.length > 1
                    ? set(at(value, [key]).value, path.slice(1), saved, exists, false, at(template, [key]).value)
                    : clonePendingValue(saved);
            if (out instanceof Map) {
                if (path.length === 1 && !exists) out.delete(key);
                else out.set(key, next);
            } else if (path.length === 1 && !exists) delete out[key];
            else Object.defineProperty(out, key, { value: next, enumerable: true, configurable: true, writable: true });
            return out;
        };
        entry.p =
            entry.p instanceof Map
                ? new Map(entry.p)
                : Object.setPrototypeOf({ ...entry.p }, Object.getPrototypeOf(entry.p));
        for (const scope of scopes) set(entry.p, scope.path, scope.saved, scope.exists, true);
        original.p = entry.p;
        original.h = entry.h;
        return true;
    } catch {
        return false;
    }
}

// Applies a save response while keeping pending edits; kept out of the async save path.
function overlayPendingResponse(
    obs$: ObservableParam<any>,
    patch: object | undefined,
    pendingToOverlay: Set<string>,
    pending: PendingChanges | undefined,
    pendingClears: PendingChanges | undefined,
    valueLocal: any,
    changesWithPath: ChangeWithPathStr[] | undefined,
) {
    let updatePatch = patch;
    if (typeof updatePatch === 'object' && updatePatch !== null) {
        const currentValue = obs$.peek();
        if (pendingToOverlay.has('')) {
            const patchMap = updatePatch instanceof Map ? updatePatch : undefined;
            const keys = patchMap ? patchMap.keys() : Object.keys(updatePatch);
            for (const key of keys) {
                const savedValue = patchMap ? patchMap.get(key) : (updatePatch as any)[key];
                const mergedValue = mergePendingValue(
                    savedValue,
                    getValueAtPath(currentValue as any, [key]),
                    getValueAtPath(valueLocal, [key]),
                );
                if (patchMap) patchMap.set(key, mergedValue);
                else
                    Object.defineProperty(updatePatch, key, {
                        value: mergedValue,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    });
            }
        }
        for (const pathStr of pendingToOverlay) {
            if (!pathStr) {
                continue;
            }
            const pendingEntry = pending?.[pathStr] || pendingClears?.[pathStr];
            if (!pendingEntry) {
                continue;
            }
            const resolved = readPendingEntry(currentValue, pathStr, pendingEntry);
            if (!resolved) {
                updatePatch = undefined;
                break;
            }
            const { path, value: currentAtPath } = resolved;
            updatePatch = overlayPendingPath(updatePatch, path, pendingEntry.t, currentAtPath, pendingEntry);
            if (updatePatch === undefined) break;
        }
        if (updatePatch !== undefined && changesWithPath) {
            for (let i = 0; i < changesWithPath.length; i++) {
                const change = changesWithPath[i];
                if (!change.pathStr || !pendingToOverlay.has(change.pathStr)) {
                    continue;
                }
                const currentAtPath = getValueAtPath(currentValue as any, change.path as string[]);
                const entry = pending?.[change.pathStr] || pendingClears?.[change.pathStr];
                updatePatch = overlayPendingPath(
                    updatePatch,
                    (entry?.k || change.path) as string[],
                    entry?.k ? entry.t : change.pathTypes,
                    currentAtPath,
                    entry,
                );
                if (updatePatch === undefined) break;
            }
        }
        if (updatePatch !== undefined) {
            onChangeRemote(() => mergeIntoObservable(obs$, updatePatch));
        }
    }
}

async function doChangeRemote(changeInfo: PreppedChangeRemote | undefined) {
    if (!changeInfo) return;

    const { queuedChange, changesRemote, changesLocal, rootSnapshot } = changeInfo;
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
        if (localState.repairLocal) {
            try {
                await localState.repairLocal();
            } catch {
                return;
            }
        }
        // Wait for remote to be ready before saving
        if ((syncOptions.get || syncOptions.subscribe) && !syncState.isLoaded.peek()) {
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

        const sentRoot = localState.pendingChanges?.[''];
        const sentRootPrevious = rootSnapshot ? rootSnapshot.previous : sentRoot?.p;
        const sentRootHistory = rootSnapshot
            ? rootSnapshot.history
            : sentRoot?.h
              ? pendingHistoryTree(sentRoot.h)
              : unknownPendingHistory;

        if (waitForSetParam) {
            await waitForSet(waitForSetParam, changesRemote, obs$.peek());
        }

        // Clone value to ensure it doesn't change observable value
        let value = clone(obs$.peek());
        const transformSave = syncOptions?.transform?.save;
        const rawLocal = obs$.peek();
        const needsLocalSnapshot =
            !rootSnapshot && localState.pendingChanges?.[''] && (!syncOptions.fieldId || transformSave);
        // Backend callbacks may mutate their transport payload after this capture.
        const localSnapshot = needsLocalSnapshot ? snapshotPendingLocal(rawLocal, undefined) : undefined;
        const canSnapshotRoot = rootSnapshot
            ? rootSnapshot.supported
            : !needsLocalSnapshot || localSnapshot !== undefined;
        const valueLocal = rootSnapshot?.supported
            ? rootSnapshot.value
            : localSnapshot !== undefined
              ? localSnapshot
              : transformSave
                ? clonePendingValue(value)
                : value;

        const selectedRoot =
            !rootSnapshot && !transformSave && !syncOptions.fieldId && !queuedChange.isApplyingPending
                ? changesRemote.find((change) => !change.path.length)
                : undefined;
        const needsSelectedSnapshot = selectedRoot && selectedRoot.valueAtPath !== rawLocal;
        const rootAckValue = needsSelectedSnapshot
            ? snapshotPendingLocal(selectedRoot.valueAtPath, undefined)
            : valueLocal;
        const canAcknowledgeRoot =
            (!rootSnapshot || rootSnapshot.supported) &&
            (!needsSelectedSnapshot ||
                selectedRoot?.valueAtPath == null ||
                typeof selectedRoot?.valueAtPath !== 'object' ||
                rootAckValue !== undefined);
        const canComposeRoot = canSnapshotRoot && canAcknowledgeRoot;

        // Pending clears track whether a reset or clear happened while sets were in flight
        // The generation count guards against older set responses removing newer pending edits
        // Track whether a clear happened while a set was in-flight to preserve pending updates
        const setGeneration = localState.pendingSetGeneration;
        const pendingSetsSinceClear = localState.pendingSetsSinceClear || 0;
        // Use generation tracking when available, otherwise fall back to the live pending count
        const hadPendingSets =
            setGeneration !== undefined ? pendingSetsSinceClear > 0 : (state$.numPendingSets.peek() || 0) > 0;
        if (setGeneration !== undefined) {
            // Record another in-flight set after the last clear
            localState.pendingSetsSinceClear = pendingSetsSinceClear + 1;
        }
        // Track in-flight sets in sync state for UI and sequencing
        const setEpoch = localState.pendingSetEpoch;
        state$.assign({ numPendingSets: (state$.numPendingSets.peek() || 0) + 1, isSetting: true });

        const beforeSetParams: Parameters<Required<SyncedOptions<any>>['onBeforeSet']>[0] = {
            cancel: false,
        };

        let updateResult: UpdateSetFnParams | undefined = undefined;
        let didSave = false;

        let lastErrorHandled: Error | undefined;

        const onSetError = (error: Error, params?: SyncedErrorParams, noThrow?: boolean) => {
            if (lastErrorHandled !== error) {
                if (!params) {
                    params = {
                        syncOptions,
                        setParams: setParams as SyncedSetParams<any>,
                        source: 'set',
                        type: 'set',
                        input: value,
                        retry: setParams,
                        revert: createRevertChanges(
                            setParams.value$,
                            changesLocal ? Array.from(changesLocal.values()) : setParams.changes,
                        ),
                    };
                } else if (!params.syncOptions) {
                    params = {
                        ...params,
                        syncOptions,
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
                    const { value, mode, changes, failedChanges } = params;
                    let mergedValue: any;
                    if (
                        updateResult.value instanceof Map &&
                        (value instanceof Map || value === undefined || getPendingRecordPrototype(value) !== undefined)
                    ) {
                        mergedValue = new Map(updateResult.value);
                        const entries = value instanceof Map ? value : Object.entries(value || {});
                        for (const [key, patch] of entries)
                            mergedValue.set(key, deepMerge(mergedValue.get(key), patch));
                    } else mergedValue = deepMerge(updateResult.value, value);
                    updateResult = {
                        value: mergedValue,
                        mode: mode,
                        changes: changes ? [...(updateResult.changes || []), ...changes] : updateResult.changes,
                        failedChanges: failedChanges
                            ? [...(updateResult.failedChanges || []), ...failedChanges]
                            : updateResult.failedChanges,
                    };
                } else {
                    updateResult = params;
                }
            },
            refresh: syncState.sync,
            retryNum: 0,
            cancelRetry: false,
        };

        try {
            if (transformSave) {
                const transformed = transformSave(value);
                value = isPromise(transformed) ? await transformed : transformed;
                setParams.value = value;
            }
            if (queuedChange.isApplyingPending) {
                for (const change of changesRemote) {
                    const entry = localState.pendingChanges?.[change.pathStr];
                    const resolved = entry
                        ? readPendingEntry(rawLocal, change.pathStr, entry)
                        : readPendingPath(rawLocal, change.pathStr ? change.pathStr.split('/') : []);
                    if (!resolved) continue;
                    const current = resolved.value;
                    if (change.path.length && entry?.v && typeof entry.v === 'object' && entry.v !== current) continue;
                    change.valueAtPath = getValueAtPath(value, change.path);
                    const local = changesLocal?.get(change.pathStr);
                    if (local) local.valueAtPath = getValueAtPath(valueLocal, local.path);
                }
            }
            onBeforeSet?.(beforeSetParams);
            if (beforeSetParams.cancel) return;
            const savedPromise = runWithRetry(setParams, syncOptions.retry, localState, async () => {
                return syncOptions!.set!(setParams);
            });
            let didError = false;

            if (isPromise(savedPromise)) {
                await savedPromise.catch((error) => {
                    didError = true;
                    onSetError(error, undefined, true);
                });
            }

            // If the plugin set which changes saved successfully then use those.
            // Or if it didn't error then use all the changes
            if (!didError || (updateResult as unknown as UpdateSetFnParams)?.changes) {
                // If this remote save changed anything then update cache and metadata
                // Because save happens after a timeout and they're batched together, some calls to save will
                // return saved data and others won't, so those can be ignored.
                const { value: updateValue, changes: updateChanges, failedChanges = [] } = updateResult! || {};
                const acknowledgedChanges = (updateChanges || changesRemote) as ChangeWithPathStr[];
                const changesWithPath = changesLocal
                    ? acknowledgedChanges.map((change) => {
                          const local = changesLocal?.get(change.pathStr);
                          return local
                              ? { ...local, valueAtPath: local.path.length ? local.valueAtPath : valueLocal }
                              : change;
                      })
                    : acknowledgedChanges;
                const pathStrs = Array.from(new Set(changesWithPath.map((change) => change.pathStr)));
                if (pathStrs.length > 0) {
                    let transformedChanges: object | undefined = undefined;
                    const metadata: PersistMetadata = {};
                    const pending = localState.pendingChanges;
                    const pendingToKeep = new Set<string>();
                    const failedPathStrs = new Set(failedChanges.map((change) => change.pathStr));
                    let rootSent = rootAckValue;
                    const changesByPath = new Map<string, ChangeWithPathStr>();
                    if (pending) {
                        for (let i = 0; i < changesWithPath.length; i++) {
                            const change = changesWithPath[i];
                            changesByPath.set(change.pathStr, change);
                        }
                        for (const key in pending) {
                            const pendingEntry = pending[key];
                            if (!pendingEntry) {
                                continue;
                            }
                            const change = changesByPath.get(key);
                            let acknowledgedValue = change?.valueAtPath;
                            if (
                                change &&
                                updateChanges &&
                                change.path.length === 0 &&
                                syncOptions.fieldId &&
                                !isArray(value)
                            ) {
                                if (pendingEntry.h?.length) {
                                    acknowledgedValue = mergePendingValue(
                                        pendingEntry.v,
                                        acknowledgedValue,
                                        change.prevAtPath,
                                        node,
                                        syncOptions.fieldId,
                                        pendingHistoryTree(pendingEntry.h),
                                    );
                                } else if (pendingEntry.h) {
                                    acknowledgedValue = changesRemote.find((sent) => sent.pathStr === key)?.valueAtPath;
                                }
                                if (!key) rootSent = acknowledgedValue;
                            } else if (
                                change &&
                                (updateChanges || !syncOptions.fieldId) &&
                                !change.path.length &&
                                canComposeRoot &&
                                !sentRootHistory?.unknown
                            ) {
                                const sent = syncOptions.fieldId
                                    ? changesRemote.find((sent) => sent.pathStr === key)?.valueAtPath
                                    : rootAckValue;
                                acknowledgedValue = mergePendingValue(
                                    pendingEntry.v,
                                    sent,
                                    sentRootPrevious,
                                    node,
                                    syncOptions.fieldId,
                                    sentRootHistory,
                                    true,
                                );
                                if (!key) rootSent = acknowledgedValue;
                            }
                            if (
                                (!key && !canAcknowledgeRoot) ||
                                failedPathStrs.has(key) ||
                                !change ||
                                !!pendingEntry.d !== !!(change as PendingChange).d ||
                                !deepEqual(pendingEntry.v, acknowledgedValue)
                            ) {
                                pendingToKeep.add(key);
                            }
                        }
                    }
                    const pendingToOverlay = new Set(pendingToKeep);
                    const pendingClears = localState.pendingClears;
                    if (pendingClears) {
                        for (const key in pendingClears) {
                            pendingToOverlay.add(key);
                        }
                    }
                    if (hadPendingSets) {
                        for (let i = 0; i < changesWithPath.length; i++) {
                            pendingToOverlay.add(changesWithPath[i].pathStr);
                        }
                    }
                    const pendingMetadata = saveLocal
                        ? pluginPersist!.getMetadata(table, configLocal)?.pending
                        : undefined;
                    const shouldDeferPendingClear = (state$.numPendingSets.peek() || 0) > 1;

                    for (let i = 0; i < pathStrs.length; i++) {
                        const pathStr = pathStrs[i];
                        if (pendingToKeep.has(pathStr)) {
                            continue;
                        }
                        const change = changesByPath.get(pathStr);
                        if (
                            updateChanges &&
                            pending?.[pathStr] &&
                            change &&
                            pendingToOverlay.has(pathStr) &&
                            deepEqual(
                                getValueAtPath(obs$.peek(), change.path),
                                changesLocal ? change.valueAtPath : getValueAtPath(valueLocal, change.path),
                            )
                        ) {
                            // Explicit acknowledgements can normalize the current edit without replaying it.
                            pendingToOverlay.delete(pathStr);
                        }
                        if (shouldDeferPendingClear && pending?.[pathStr]) {
                            if (!localState.pendingClears) {
                                localState.pendingClears = {};
                            }
                            Object.defineProperty(localState.pendingClears, pathStr, {
                                value: pending[pathStr],
                                enumerable: true,
                                configurable: true,
                                writable: true,
                            });
                        }
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

                    // Remote can optionally have data that needs to be merged back into the observable,
                    // for example Firebase may update dateModified with the server timestamp
                    if (updateValue && !isEmpty(updateValue)) {
                        transformedChanges = transformLoadData(updateValue, syncOptions, false, 'set');
                    }

                    if (isPromise(transformedChanges)) {
                        transformedChanges = (await transformedChanges) as object;
                    }
                    const rootPending = pending?.[''];
                    const rootResponse =
                        rootPending && transformedChanges !== undefined ? clone(transformedChanges) : undefined;
                    const rootAcknowledged =
                        !!rootPending &&
                        canAcknowledgeRoot &&
                        acknowledgePendingRoot(
                            rootPending,
                            obs$.peek(),
                            rootSent,
                            changesWithPath,
                            failedPathStrs,
                            rootResponse,
                            pending!,
                            node,
                            syncOptions.fieldId,
                        );
                    if (transformedChanges !== undefined) {
                        if (pendingToOverlay.size === 0) {
                            onChangeRemote(() => mergeIntoObservable(obs$, transformedChanges));
                        } else if (!pendingToOverlay.has('') || failedPathStrs.has('') || rootAcknowledged) {
                            overlayPendingResponse(
                                obs$,
                                rootPending ? rootResponse : clone(transformedChanges),
                                pendingToOverlay,
                                pending,
                                pendingClears,
                                valueLocal,
                                hadPendingSets ? changesWithPath : undefined,
                            );
                        }
                    }

                    if (pending && transformedChanges !== undefined) {
                        for (const key of pendingToKeep) {
                            const entry = pending[key];
                            if (!key || !entry?.c) continue;
                            const resolved = readPendingEntry(obs$.peek(), key, entry);
                            if (resolved) entry.v = resolved.value;
                            else delete entry.c;
                            if (saveLocal) metadata.pending = pending;
                        }
                    }
                    if (pending?.['']) {
                        pending[''].v = obs$.peek();
                        pending[''].c = true;
                        if (saveLocal && transformedChanges !== undefined) metadata.pending = pending;
                    }
                    if (rootAcknowledged) {
                        if (rootPending!.h && rootPending!.h.length === 0 && deepEqual(rootPending!.p, obs$.peek())) {
                            delete pending![''];
                            if (pendingClears) delete pendingClears[''];
                        }
                        if (saveLocal) metadata.pending = pending;
                    }
                    if (saveLocal && !isEmpty(metadata)) {
                        if (metadata.pending) {
                            try {
                                await updateMetadataImmediate(obs$, localState, syncState, syncOptions, metadata);
                            } catch (error) {
                                onSetError(error as Error, undefined, true);
                            }
                        } else if (shouldSaveMetadata)
                            updateMetadata(obs$, localState, syncState, syncOptions, metadata, (error) =>
                                onSetError(error, undefined, true),
                            );
                    }
                }

                didSave = true;
            }
        } catch (error) {
            onSetError(error as Error, undefined, true);
        } finally {
            if (localState.pendingSetEpoch === setEpoch) {
                const remainingSets = state$.numPendingSets.peek()! - 1;
                if (setGeneration !== undefined && localState.pendingSetGeneration === setGeneration) {
                    localState.pendingSetsSinceClear = (localState.pendingSetsSinceClear || 1) - 1;
                }
                if (!remainingSets) {
                    if (localState.pendingSetGeneration !== undefined && !localState.pendingSetsSinceClear) {
                        localState.pendingSetGeneration = undefined;
                        localState.pendingSetsSinceClear = undefined;
                    }
                    localState.pendingClears = undefined;
                }
                state$.assign({ numPendingSets: remainingSets, isSetting: remainingSets > 0 });
            }
        }
        if (didSave) onAfterSet?.();
    }
}

function onObsChange<T>(
    value$: ObservableParam<T>,
    syncState: ObservableObject<ObservableSyncState>,
    localState: LocalState,
    syncOptions: SyncedOptions<T>,
    { changes, value: currentValue, isFromPersist, isFromSync, getPrevious }: ListenerParams,
) {
    if (!isFromPersist) {
        const inRemoteChange = isFromSync;
        const isApplyingPending = localState.isApplyingPending;
        if (!inRemoteChange && !isApplyingPending) {
            let annotated: PendingChange[] | undefined;
            for (let i = 0; i < changes.length; i++) {
                const change = changes[i];
                const { path, valueAtPath, pathTypes } = change;
                if (!path.length) continue;
                let needsPath = valueAtPath === undefined || currentValue instanceof Map || pathTypes.includes('map');
                if (!needsPath) {
                    for (const part of path) {
                        if (typeof part === 'string' && part.includes('/')) needsPath = true;
                    }
                }
                if (!needsPath) continue;
                let supportedPath = true;
                for (const part of path) {
                    if (typeof part !== 'string' && (typeof part !== 'number' || !Number.isFinite(part))) {
                        supportedPath = false;
                        break;
                    }
                }
                if (!supportedPath) continue;
                try {
                    let missing = false;
                    if (valueAtPath === undefined) {
                        let parent = getNodeValue(getNode(value$));
                        for (let j = 0; parent && j < path.length - 1; j++) {
                            parent = parent instanceof Map ? Map.prototype.get.call(parent, path[j]) : parent[path[j]];
                        }
                        const key = path[path.length - 1];
                        missing =
                            parent instanceof Map
                                ? !Map.prototype.has.call(parent, key)
                                : parent != null && !Object.prototype.hasOwnProperty.call(parent, key);
                    }
                    (annotated ||= changes.slice() as PendingChange[])[i] = {
                        ...change,
                        k: path.slice(),
                        d: missing ? true : undefined,
                    };
                } catch {
                    // Keep the original change when authorship membership cannot be inspected.
                }
            }
            if (annotated) changes = annotated;
        }
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
        return loadPersistedLocal(
            value$,
            syncOptions,
            syncState$,
            localState,
            persist,
            node,
            nodeValue,
            syncStateValue,
            prevResetPersistence,
        );
    }

    // Console.warn if no persist name is provided. It's ok if name is undefined as that can be the user manually disabling it,
    // but if not provided at all it's likely user error.
    if (
        (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
        persist &&
        persist.plugin &&
        !Object.hasOwn(persist, 'name')
    ) {
        console.warn(
            '[legend-state] Trying to syncObservable without `name` defined. Please include a `name` property in the `persist` configuration.',
        );
    }
    nodeValue.resetPersistence = () => prevResetPersistence?.();
    // TODOV3 Remove
    nodeValue.clearPersist = nodeValue.resetPersistence;

    syncState$.isPersistLoaded.set(!(syncStateValue.numPendingLocalLoads! > 0));
}

async function loadPersistedLocal<T>(
    value$: ObservableParam<T>,
    syncOptions: SyncedOptions<any>,
    syncState$: ObservableObject<ObservableSyncState>,
    localState: LocalState,
    persist: PersistOptions<any>,
    node: NodeInfo,
    nodeValue: ObservableSyncState,
    syncStateValue: ObservableSyncState,
    prevResetPersistence: ObservableSyncState['resetPersistence'],
) {
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
    localState.persistedRootType = internal.getPathType(value);
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

    const pending = localState.pendingChanges;
    if (pending && !isEmpty(pending)) {
        let restored = getNodeValue(node);
        let changedChild = false;
        let childRestores: { path: string[]; value: any }[] | undefined;
        for (const key of Object.keys(pending).sort((a, b) => a.split('/').length - b.split('/').length)) {
            const entry = pending[key];
            if (!key && !entry.c) continue;
            const resolved = readPendingEntry(restored, key, entry);
            if (!resolved) continue;
            const { path, value: current } = resolved;
            if (entry.k && (entry.d || entry.v === undefined)) {
                if (!('nilWritable' in resolved && resolved.nilWritable)) continue;
                const exists = 'exists' in resolved && resolved.exists;
                if (entry.d ? !exists : exists && current === undefined) continue;
                changedChild = true;
                if (restored === getNodeValue(node)) {
                    (childRestores ||= []).push({ path, value: entry.d ? internal.symbolDelete : entry.v });
                } else writePendingPath(restored, path, entry.t, entry.v, entry.d);
                continue;
            }
            const previous = entry.p;
            const working = { ...entry, h: entry.h ? entry.h.slice() : emptyPendingHistory };
            const fieldId = key ? undefined : syncOptions.fieldId;
            const keys =
                key && entry.h ? undefined : addPendingHistory(working, undefined, previous, [], node, fieldId);
            if (entry.c || !entry.h?.length) addPendingHistory(working, previous, entry.v, [], node, fieldId, keys);
            const history = pendingHistoryTree(working.h);
            const value = mergePendingValue(
                current,
                entry.v,
                key && !entry.c && entry.h?.length ? entry.v : previous,
                key ? undefined : node,
                fieldId,
                history,
                true,
            );
            const baseline = mergePendingValue(
                current,
                previous,
                previous,
                key ? undefined : node,
                fieldId,
                history,
                true,
            );
            if (baseline !== previous) entry.p = clonePendingValue(baseline);
            entry.v = value;
            entry.c = true;
            if (key && !deepEqual(value, current)) {
                changedChild = true;
                if (restored === getNodeValue(node)) {
                    (childRestores ||= []).push({ path, value });
                    continue;
                }
            }
            restored = key ? setAtPath(restored, path, entry.t, value) : value;
        }
        node.root.isLoadingLocal = true;
        internal.globalState.isLoadingLocal = true;
        try {
            beginBatch();
            try {
                if (childRestores) {
                    for (const { path, value } of childRestores) {
                        let child = node;
                        for (const key of path) child = internal.getChildNode(child, key);
                        internal.set(child, value);
                    }
                } else value$.set(restored);
                restored = getNodeValue(node);
                if (pending['']?.c) pending[''].v = restored;
            } finally {
                endBatch();
            }
        } finally {
            node.root.isLoadingLocal = false;
            internal.globalState.isLoadingLocal = false;
        }
        if (changedChild || !deepEqual(restored, value)) {
            const initialValue = clonePendingValue(restored);
            let firstRepair = true;
            let repairing: Promise<void> | undefined;
            const repair = () => {
                if (!repairing) {
                    const first = firstRepair;
                    firstRepair = false;
                    let input: any;
                    const saved = queueLocalSave(localState, () =>
                        Promise.resolve().then(() => {
                            if (localState.repairLocal !== repair) return;
                            input = first ? initialValue : clonePendingValue(getNodeValue(node));
                            return doInOrder(transformSaveData(input, [], [], config), (saved) =>
                                doInOrder(
                                    config.retrySync
                                        ? writeMetadata(value$, localState, syncState$, syncOptions, {
                                              pending: localState.pendingChanges,
                                          })
                                        : undefined,
                                    () =>
                                        persistPlugin.set(
                                            table,
                                            [
                                                {
                                                    path: saved.path,
                                                    pathTypes: [],
                                                    prevAtPath: value,
                                                    valueAtPath: saved.value,
                                                },
                                            ],
                                            config,
                                        ),
                                ),
                            );
                        }),
                    );
                    repairing = Promise.resolve(saved).then(
                        () => {
                            if (localState.repairLocal === repair) localState.repairLocal = undefined;
                        },
                        (error) => {
                            repairing = undefined;
                            reportSetError({ syncState: syncState$, syncOptions }, error, () => input);
                            throw error;
                        },
                    );
                }
                return repairing;
            };
            localState.repairLocal = repair;
            repair().catch(() => undefined);
        }
    }

    syncStateValue.numPendingLocalLoads--;

    nodeValue.resetPersistence = () =>
        Promise.resolve(
            queueLocalSave(localState, () => {
                return Promise.all(
                    [
                        prevResetPersistence?.(),
                        persistPlugin.deleteTable(table, config),
                        persistPlugin.deleteMetadata(table, config),
                    ].filter(Boolean),
                ).then(() => {
                    localState.repairLocal = undefined;
                });
            }),
        );
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

    markNodeAsSynced(node);

    const initial = syncOptions.initial;

    // Merge remote sync options with global options
    syncOptions = deepMerge(
        {
            syncMode: 'auto',
        },
        observableSyncConfiguration,
        removeNullUndefined(syncOptions || {}),
    );
    const initialSnapshot = isFunction(initial) ? undefined : cloneInitialValue(initial);
    const getInitialValue = isFunction(initial)
        ? () => initial()
        : () => cloneInitialValue(initialSnapshot) ?? undefined;
    const syncState$ = syncState(obs$);
    const syncStateValue = getNodeValue(getNode(syncState$)) as ObservableSyncState;
    const localState: LocalState = {};
    let sync: (options?: ObservableSyncStateOptions) => Promise<void>;
    const resetPendingState = () => {
        localState.pendingChanges = {};
        localState.pendingClears = undefined;
        // Reset starts a new generation only when older sets are still in flight
        // This lets later set completions detect that pending was cleared and avoid resurrecting it
        // Only start tracking pending clears when there are in-flight sets
        const hasPendingSets = (syncStateValue.numPendingSets || 0) > 0;
        localState.pendingSetGeneration = hasPendingSets ? (localState.pendingSetGeneration ?? 0) + 1 : undefined;
        localState.pendingSetsSinceClear = hasPendingSets ? 0 : undefined;
    };
    allSyncStates.set(syncState$, node);
    syncStateValue.getPendingChanges = () => localState.pendingChanges;

    let lastErrorHandled: Error | undefined;
    const onGetError = (error: Error, params: SyncedErrorParams, noThrow?: boolean) => {
        if (lastErrorHandled !== error) {
            if (!params) {
                params = {
                    syncOptions,
                    source: 'get',
                    type: 'get',
                    retry: { retryNum: 0, cancelRetry: false },
                };
            } else if (!params.syncOptions) {
                params = {
                    ...params,
                    syncOptions,
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

    let latestGet = 0;
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
                const { p, t, v } = pending[key];
                const resolved = readPendingEntry(value, key, pending[key]);
                if (!resolved) continue;
                const { path, value: valueAtPath } = resolved;
                if (isApplyingPendingAfterSync || !deepEqual(valueAtPath, v)) {
                    const change: PendingChange = { path, valueAtPath: v, prevAtPath: p, pathTypes: t };
                    if (pending[key].k) {
                        change.k = pending[key].k;
                        if (pending[key].d) change.d = true;
                    }
                    changes.push(change);
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
        // we create the closure outside the new sync definition to avoid recreating the function on each call
        const callSync = () => sync();
        sync = async (options?: ObservableSyncStateOptions) => {
            // If this node is not being observed or sync is not enabled then don't sync
            if (isSynced && (!getNodeValue(getNode(syncState$)).isSyncEnabled || shouldIgnoreUnobserved(node, sync))) {
                if (unsubscribe) {
                    isSubscribed = false;
                    unsubscribe();
                    unsubscribe = undefined;
                }
                return;
            }
            const metadata = metadatas.get(obs$);
            if (metadata && options?.resetLastSync) {
                metadata.lastSync = undefined;
                syncState$.lastSync.set(undefined);
            }
            const lastSync = metadata?.lastSync;
            const pending = localState.pendingChanges;

            const { waitFor } = syncOptions;

            const runGet = () => {
                const onChange = (
                    { value, mode, lastSync }: UpdateFnParams,
                    getNumber?: number,
                    onMetadataError?: (error: Error) => void,
                    onPendingMetadataError?: () => void,
                ) => {
                    mode = mode || syncOptions.mode || 'set';
                    const hasValue = value !== undefined;
                    const apply = (value: any) => {
                        if (getNumber !== undefined && getNumber < (node.getNumResolved || 0)) return;
                        let metadataSaved: void | Promise<void> = undefined;
                        if (hasValue) {
                            const originalPending = localState.pendingChanges;
                            const currentValue = obs$.peek();
                            const pendingKeys = originalPending && Object.keys(originalPending);
                            const stagedPending = pendingKeys?.some(Boolean);
                            const pending = stagedPending ? (Object.create(null) as PendingChanges) : originalPending;
                            if (stagedPending) {
                                for (const key of pendingKeys!) {
                                    const entry = originalPending![key];
                                    pending![key] = { ...entry, h: entry.h?.slice() };
                                }
                            }
                            let unresolvedPending = false;
                            const resolvedPaths = stagedPending ? new Map<string, string[]>() : undefined;
                            let reconciledRoot = false;
                            let assignMapDelta = false;
                            let didChangeMetadata = false;
                            if (pending) {
                                // Compare child acknowledgements with the incoming data, before root overlays.
                                const remoteValue = value;
                                // Merge pending values onto remote changes
                                pendingKeys!.forEach((key) => {
                                    const entry = pending[key];
                                    if ((!key && entry.t.length) || (key && (!value || typeof value !== 'object'))) {
                                        unresolvedPending = true;
                                        return;
                                    }
                                    if (!entry.h) {
                                        const resolved = key ? readPendingEntry(currentValue, key, entry) : undefined;
                                        if (key && !resolved) {
                                            unresolvedPending = true;
                                            return;
                                        }
                                        entry.h = emptyPendingHistory;
                                        const fieldId = key ? undefined : syncOptions.fieldId;
                                        const keys = addPendingHistory(entry, undefined, entry.p, [], node, fieldId);
                                        addPendingHistory(
                                            entry,
                                            entry.p,
                                            key ? resolved!.value : currentValue,
                                            [],
                                            node,
                                            fieldId,
                                            keys,
                                        );
                                    }
                                    const { t, p: previous, h } = entry;

                                    if (!key) {
                                        if (
                                            mode === 'set' &&
                                            detachedAssignBaselines.has(previous) &&
                                            deepEqual(currentValue, value)
                                        ) {
                                            delete pending[key];
                                            didChangeMetadata = true;
                                            value = currentValue;
                                            return;
                                        }
                                        if (mode === 'assign' && !syncOptions.fieldId) {
                                            const assigned = reconcilePendingAssign(entry, currentValue, value, node);
                                            if (assigned) {
                                                entry.p = assigned.baseline;
                                                value = assigned.patch;
                                                assignMapDelta = isMap(value);
                                                didChangeMetadata = true;
                                                return;
                                            }
                                        }
                                        if (mode !== 'set') {
                                            value = normalizePendingRoot(
                                                previous,
                                                value,
                                                mode!,
                                                node,
                                                syncOptions.fieldId,
                                            );
                                            reconciledRoot = true;
                                        }
                                        addPendingHistory(entry, previous, currentValue, [], node, syncOptions.fieldId);
                                        // Update pending previous value with result
                                        const oldValue = clonePendingValue(value);
                                        pending[key].p = oldValue;
                                        didChangeMetadata = true;

                                        let mergedValue = mergePendingValue(
                                            value,
                                            currentValue,
                                            previous,
                                            node,
                                            syncOptions.fieldId,
                                            pendingHistoryTree(entry.h),
                                            mode === 'set' || reconciledRoot,
                                        );
                                        if (mode === 'set' && deepEqual(mergedValue, value)) {
                                            delete pending[key];
                                        }
                                        if (mode === 'prepend' && isArray(mergedValue) && isArray(currentValue)) {
                                            const reordered = normalizePendingRoot(
                                                currentValue,
                                                mergedValue,
                                                'prepend',
                                                node,
                                                syncOptions.fieldId,
                                            );
                                            if (reordered.length === mergedValue.length) mergedValue = reordered;
                                        }
                                        value = mergedValue;
                                    } else {
                                        const first = entry.k
                                            ? entry.k[0]
                                            : pendingPathKey(currentValue, key.split('/').filter((k) => k !== '')[0]);
                                        if (first === undefined) {
                                            unresolvedPending = true;
                                            return;
                                        }
                                        const remoteFirst = getValueAtPath(remoteValue as object, [first as string]);
                                        const resolved = readPendingEntry(currentValue, key, entry);
                                        if (!resolved) {
                                            unresolvedPending = true;
                                            return;
                                        }
                                        resolvedPaths?.set(key, resolved.path);
                                        let incoming: ReturnType<typeof readPendingEntry>;
                                        if (entry.k && (mode === 'merge' || mode === 'assign')) {
                                            incoming = readPendingEntry(remoteValue, key, entry);
                                            if (!incoming) {
                                                unresolvedPending = true;
                                                return;
                                            }
                                            const omittedAncestor =
                                                'missingAncestor' in incoming ? incoming.missingAncestor : undefined;
                                            if (
                                                omittedAncestor?.length === 1 ||
                                                (incoming.path.length === 1 && 'exists' in incoming && !incoming.exists)
                                            )
                                                return;
                                            if (
                                                !('parentsExist' in incoming && incoming.parentsExist) &&
                                                !omittedAncestor
                                            ) {
                                                unresolvedPending = true;
                                                return;
                                            }
                                            if (mode === 'merge' && 'exists' in incoming && !incoming.exists) return;
                                        }
                                        if (entry.k && (entry.d || entry.v === undefined)) {
                                            incoming ||= readPendingEntry(remoteValue, key, entry);
                                            if (!incoming || !('nilWritable' in incoming && incoming.nilWritable)) {
                                                unresolvedPending = true;
                                                return;
                                            }
                                            const exists = 'exists' in incoming && incoming.exists;
                                            if (!exists && mode !== 'set' && mode !== 'assign') return;
                                            if (
                                                entry.d ||
                                                (mode !== 'set' && mode !== 'assign') ||
                                                !('missingAncestor' in incoming && incoming.missingAncestor)
                                            ) {
                                                if (
                                                    (entry.d && !exists) ||
                                                    (!entry.d && exists && incoming.value === undefined)
                                                )
                                                    delete pending[key];
                                                else {
                                                    if (exists) entry.p = clonePendingValue(incoming.value);
                                                    value = writePendingPath(value, resolved.path, t, entry.v, entry.d);
                                                }
                                                didChangeMetadata = true;
                                                return;
                                            }
                                        }
                                        if (
                                            remoteFirst === undefined &&
                                            mode !== 'set' &&
                                            (!entry.k ||
                                                !(remoteValue instanceof Map
                                                    ? Map.prototype.has.call(remoteValue, first)
                                                    : Object.prototype.hasOwnProperty.call(remoteValue, first)))
                                        )
                                            return;
                                        const curValue = resolved.value;
                                        incoming ||= entry.k
                                            ? readPendingEntry(remoteValue, key, entry)
                                            : mode === 'set'
                                              ? readOwnPendingPath(remoteValue, resolved.path)
                                              : undefined;
                                        const missingAncestor =
                                            (mode === 'set' || mode === 'assign') &&
                                            incoming &&
                                            'missingAncestor' in incoming
                                                ? incoming.missingAncestor
                                                : undefined;
                                        if (
                                            (entry.k || mode === 'set') &&
                                            (!incoming ||
                                                (!('parentsExist' in incoming && incoming.parentsExist) &&
                                                    (entry.k ||
                                                        !('nilWritable' in incoming && incoming.nilWritable)))) &&
                                            !missingAncestor
                                        ) {
                                            unresolvedPending = true;
                                            return;
                                        }
                                        const newValue = incoming
                                            ? incoming.value
                                            : getValueAtPath(remoteValue as object, resolved.path);
                                        if (!missingAncestor && deepEqual(curValue, newValue)) {
                                            delete pending[key];
                                            didChangeMetadata = true;
                                        } else {
                                            const mergedValue = mergePendingValue(
                                                newValue,
                                                curValue,
                                                previous,
                                                undefined,
                                                undefined,
                                                pendingHistoryTree(h),
                                                mode === 'set',
                                            );
                                            if (!missingAncestor && deepEqual(mergedValue, newValue)) {
                                                delete pending[key];
                                            } else if (!incoming || ('exists' in incoming && incoming.exists)) {
                                                pending[key].p = clonePendingValue(newValue);
                                            }

                                            didChangeMetadata = true;
                                            if (missingAncestor) {
                                                const path = missingAncestor;
                                                const restored = readOwnPendingPath(currentValue, path);
                                                if (
                                                    !restored ||
                                                    !('exists' in restored && restored.exists) ||
                                                    restored.value === null ||
                                                    typeof restored.value !== 'object'
                                                ) {
                                                    unresolvedPending = true;
                                                    return;
                                                }
                                                const restoredValue = overlayPendingPathCopy(
                                                    value,
                                                    path,
                                                    t,
                                                    restored.value,
                                                );
                                                if (restoredValue === undefined) {
                                                    unresolvedPending = true;
                                                    return;
                                                }
                                                value = restoredValue;
                                            } else if (
                                                !entry.k &&
                                                incoming &&
                                                'parentsExist' in incoming &&
                                                !incoming.parentsExist
                                            ) {
                                                const overlaid = overlayPendingPathCopy(
                                                    value,
                                                    resolved.path,
                                                    t,
                                                    mergedValue,
                                                );
                                                if (overlaid === undefined) {
                                                    unresolvedPending = true;
                                                    return;
                                                }
                                                value = overlaid;
                                            } else {
                                                (value as any) = setAtPath(
                                                    value as any,
                                                    resolved.path,
                                                    t,
                                                    mergedValue,
                                                    'set',
                                                    obs$.peek(),
                                                    (path: string[], value: any) => {
                                                        delete pending[key];
                                                        const pathStr = path.join('/');
                                                        const restoredEntry: PendingChanges[string] = {
                                                            p: null,
                                                            v: value,
                                                            t: t.slice(0, path.length),
                                                            h: undefined,
                                                        };
                                                        if (entry.k) restoredEntry.k = entry.k.slice(0, path.length);
                                                        Object.defineProperty(pending, pathStr, {
                                                            value: restoredEntry,
                                                            enumerable: true,
                                                            configurable: true,
                                                            writable: true,
                                                        });
                                                    },
                                                );
                                            }
                                        }
                                    }
                                });
                                if (unresolvedPending) return;
                                if (stagedPending) {
                                    for (const key of pendingKeys!) {
                                        const staged = pending![key];
                                        if (staged) pending![key] = Object.assign(originalPending![key], staged);
                                        else delete originalPending![key];
                                    }
                                    for (const key of Object.keys(pending!)) {
                                        if (!Object.prototype.hasOwnProperty.call(originalPending!, key)) {
                                            Object.defineProperty(originalPending, key, {
                                                value: pending![key],
                                                enumerable: true,
                                                configurable: true,
                                                writable: true,
                                            });
                                        }
                                    }
                                }
                            }

                            if (options?.resetLastSync) {
                                // Reset the node to the initial value before updating it with fresh
                                // server results
                                setNodeValue(node, getInitialValue());
                            }

                            if (reconciledRoot) mode = 'set';
                            onChangeRemote(() => {
                                if (isPlainObject(value)) {
                                    value = ObservableHint.plain(value);
                                }
                                if (assignMapDelta) {
                                    for (const [key, item] of value as Map<any, any>) (obs$ as any).set(key, item);
                                } else if (mode === 'assign') {
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
                            if (pending) {
                                for (const key of Object.keys(pending)) {
                                    const entry = pending[key];
                                    const path = entry.k ? undefined : resolvedPaths?.get(key);
                                    const resolved = entry.k
                                        ? readPendingEntry(obs$.peek(), key, entry)
                                        : path
                                          ? { value: getValueAtPath(obs$.peek() as any, path) }
                                          : readPendingEntry(obs$.peek(), key, entry);
                                    if (!resolved) continue;
                                    entry.v = resolved.value;
                                    entry.c = true;
                                }
                            }
                            if (didChangeMetadata && syncOptions.persist) {
                                metadataSaved = updateMetadataImmediate(obs$, localState, syncState$, syncOptions, {
                                    pending: originalPending,
                                });
                            }
                        }
                        if (lastSync && syncOptions.persist) {
                            updateMetadata(
                                obs$,
                                localState,
                                syncState$,
                                syncOptions,
                                { lastSync },
                                onMetadataError ||
                                    ((error) =>
                                        onGetError(
                                            error,
                                            {
                                                syncOptions,
                                                source: 'get',
                                                type: 'get',
                                                retry: { retryNum: 0, cancelRetry: false },
                                            },
                                            true,
                                        )),
                            );
                        }
                        if (isPromise(metadataSaved) && onPendingMetadataError) {
                            return metadataSaved.catch((error) => {
                                onPendingMetadataError();
                                throw error;
                            });
                        }
                        return metadataSaved;
                    };
                    try {
                        if (localState.repairLocal) {
                            return localState
                                .repairLocal()
                                .then(() =>
                                    doInOrder(
                                        hasValue ? transformLoadData(value, syncOptions, true, 'get') : undefined,
                                        apply,
                                    ),
                                );
                        }
                        return doInOrder(
                            hasValue ? transformLoadData(value, syncOptions, true, 'get') : undefined,
                            apply,
                        );
                    } catch (error) {
                        return Promise.reject(error);
                    }
                };
                if (node.activationState) {
                    node.activationState!.onChange = onChange;
                }
                // Subscribe before getting to ensure we don't miss updates between now and the get returning
                if (!isSubscribed && syncOptions.subscribe) {
                    const subscribe = syncOptions.subscribe;
                    const doSubscribe = () => {
                        isSubscribed = true;
                        const onMetadataError = (error: Error) =>
                            onGetError(
                                error,
                                {
                                    source: 'subscribe',
                                    syncOptions,
                                    subscribeParams,
                                    type: 'get',
                                    retry: {} as OnErrorRetryParams,
                                },
                                true,
                            );
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
                                            const finish = () => {
                                                // If no get then we need to set the loaded state
                                                if (!syncState$.isLoaded.peek()) {
                                                    syncState$.assign({
                                                        isLoaded: (syncStateValue.numPendingRemoteLoads || 0) < 1,
                                                        error: undefined,
                                                        isGetting: syncStateValue.numPendingGets! > 0,
                                                    });
                                                }
                                            };
                                            const changed = doInOrder(
                                                onChange(params, undefined, onMetadataError, finish),
                                                finish,
                                            );
                                            if (isPromise(changed)) changed.catch(onMetadataError);
                                        });
                                    },
                                );
                            },
                            refresh: () => when(syncState$.isLoaded, callSync),
                            onError: (error: Error) =>
                                onGetError(error, {
                                    source: 'subscribe',
                                    syncOptions,
                                    subscribeParams,
                                    type: 'get',
                                    retry: {} as OnErrorRetryParams,
                                }),
                        };
                        unsubscribe = subscribe(subscribeParams);
                        registerMiddleware(node, 'listeners-cleared', () => {
                            if (unsubscribe) {
                                isSubscribed = false;
                                unsubscribe();
                                unsubscribe = undefined;
                            }
                        });
                        registerMiddleware(node, 'listener-added', () => {
                            if (!isSubscribed) {
                                doSubscribe();
                            }
                        });
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
                        value: isFunction(existingValue) || existingValue?.[symbolLinked] ? undefined : existingValue,
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
                            resetPendingState();
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
                        const got = runWithRetry(getParams, syncOptions.retry, sync, (retryEvent) => {
                            const params = getParams as SyncedGetParams<T>;
                            params.cancelRetry = retryEvent.cancelRetry;
                            params.retryNum = retryEvent.retryNum;
                            return get(params);
                        });
                        const numGets = (node.numGets = (node.numGets || 0) + 1);
                        let settled = false;
                        const settle = () => {
                            if (!settled) {
                                settled = true;
                                syncState$.numPendingGets.set((v) => v! - 1);
                                syncState$.isGetting.set(syncStateValue.numPendingGets! > 0);
                            }
                        };
                        const handle = (value: any) => {
                            latestGet = Math.max(latestGet, numGets);
                            let changed: void | Promise<void> = undefined;
                            const finish = () => {
                                settle();
                                if (numGets === latestGet && isWaitingForLoad) {
                                    isWaitingForLoad = false;
                                    syncStateValue.numPendingRemoteLoads!--;
                                }
                                if (modeBeforeReset) {
                                    getParams.mode = modeBeforeReset;
                                    modeBeforeReset = undefined;
                                }
                                syncState$.isLoaded.set(syncStateValue.numPendingRemoteLoads! < 1);
                                if (numGets >= (node.getNumResolved || 0)) syncState$.error.set(undefined);
                            };
                            if (numGets >= (node.getNumResolved || 0)) {
                                node.getNumResolved = numGets;
                                changed = onChange(
                                    { value, lastSync: getParams.lastSync, mode: getParams.mode! },
                                    numGets,
                                    undefined,
                                    finish,
                                );
                            }
                            return doInOrder(changed, finish);
                        };
                        const onError = (error: Error) => {
                            latestGet = Math.max(latestGet, numGets);
                            settle();
                            if (numGets >= (node.getNumResolved || 0)) {
                                node.getNumResolved = numGets;
                                onGetError(
                                    error,
                                    { getParams, syncOptions, source: 'get', type: 'get', retry: getParams },
                                    true,
                                );
                            }
                        };
                        try {
                            const handled = doInOrder(got, handle);
                            if (isPromise(handled)) handled.catch(onError);
                        } catch (error) {
                            onError(error as Error);
                        }
                    }
                }
            };

            if (waitFor) {
                whenReady(waitFor, () => trackSelector(runGet, callSync));
            } else {
                trackSelector(runGet, callSync);
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
        resetPendingState();
        localState.pendingSetEpoch = (localState.pendingSetEpoch || 0) + 1;
        const newState: Partial<ObservableSyncState> = {
            isPersistEnabled: false,
            isSyncEnabled: false,
            lastSync: undefined,
            numPendingGets: 0,
            isLoaded: false,
            isGetting: false,
            isSetting: false,
            numPendingSets: 0,
            syncCount: 0,
        };
        Object.assign(syncStateValue, newState);
        isSynced = false;
        isSubscribed = false;
        unsubscribe?.();
        unsubscribe = undefined;
        const promise = syncStateValue.resetPersistence();
        onChangeRemote(() => {
            obs$.set(getInitialValue());
        });
        syncStateValue.isPersistEnabled = wasPersistEnabled;
        syncStateValue.isSyncEnabled = wasSyncEnabled;
        node.dirtyFn = sync;
        await promise;
    };

    syncState$.lastSync.onChange(({ value }) => {
        const metadata = metadatas.get(obs$);
        if (metadata && metadata.lastSync !== value) {
            const saved = updateMetadataImmediate(obs$, localState, syncState$, syncOptions, {
                lastSync: value,
            });
            if (isPromise(saved))
                saved.catch((error: Error) =>
                    reportSetError({ syncState: syncState$, syncOptions }, error, () => obs$.peek()),
                );
        }
    });

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
        if (syncOptions?.set || syncOptions?.persist) {
            obs$.onChange(
                onObsChange.bind(this, obs$ as any, syncState$, localState, syncOptions as SyncedOptions<any>),
            );
        }

        // If remote is not manual, then sync() is called automatically
        if ((syncOptions.get || syncOptions.subscribe) && syncOptions.syncMode === 'auto') {
            sync();
        }
    });

    return syncState$;
}

export function getAllSyncStates(): readonly [Observable<ObservableSyncState>, NodeInfo][] {
    return Array.from(allSyncStates.entries());
}
