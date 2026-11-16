import {
    ChangeWithPathStr,
    ObservableEvent,
    ObservableParam,
    RetryOptions,
    UpdateFnParams,
    WaitForSetFnParams,
    getNodeValue,
    internal,
    isArray,
    isNullOrUndefined,
    isPromise,
    symbolDelete,
} from '@legendapp/state';
import {
    SyncedErrorParams,
    SyncedGetParams,
    SyncedOptions,
    SyncedSetParams,
    SyncedSubscribeParams,
    deepEqual,
    diffObjects,
    internal as internalSync,
    synced,
} from '@legendapp/state/sync';

const { clone, getKeys, setNodeValue, getChildNode, getNode } = internal;
const { waitForSet, runWithRetry } = internalSync;

export type CrudAsOption = 'Map' | 'object' | 'value' | 'array';

export type CrudResult<T> = T;

export interface SyncedCrudPropsNoRead<TLocal, TAsOption extends CrudAsOption> {
    get?: never | undefined;
    list?: never | undefined;
    initial?: InitialValue<TLocal, TAsOption>;
    as?: TAsOption;
}
export interface SyncedCrudPropsSingle<TRemote extends object, TLocal> {
    get: (params: SyncedGetParams<TRemote>) => Promise<CrudResult<TRemote | null>> | CrudResult<TRemote | null>;
    list?: never | undefined;
    initial?: InitialValue<Partial<NoInfer<TLocal>>, 'value'>;
    as?: never | 'value';
}
export interface SyncedCrudPropsMany<TRemote extends object, TLocal, TAsOption extends CrudAsOption> {
    list: (params: SyncedGetParams<TRemote>) => Promise<CrudResult<TRemote[] | null>> | CrudResult<TRemote[] | null>;
    get?: never | undefined;
    as?: TAsOption;
    initial?: InitialValue<Partial<NoInfer<TLocal>>, TAsOption>;
}
export interface SyncedCrudOnSavedParams<TRemote extends object, TLocal> {
    saved: TLocal;
    input: TRemote;
    currentValue: TLocal;
    isCreate: boolean;
    props: SyncedCrudPropsBase<TRemote, TLocal>;
}

export interface WaitForSetCrudFnParams<T> extends Omit<WaitForSetFnParams<T>, 'changes'> {
    changes: ChangeWithPathStr[];
    type: 'create' | 'update' | 'delete';
}

export interface CrudErrorParams extends Omit<SyncedErrorParams, 'source'> {
    source: 'list' | 'get' | 'create' | 'update' | 'delete' | 'unknown';
}

export type CrudOnErrorFn = (error: Error, params: CrudErrorParams) => void;

export interface SyncedCrudPropsBase<TRemote extends object, TLocal = TRemote>
    extends Omit<SyncedOptions<TRemote, TLocal>, 'get' | 'set' | 'initial' | 'subscribe' | 'waitForSet' | 'onError'> {
    /**
     * Creates an item on the server. The client generates the id (e.g. with `generateId`), so the
     * server must persist and return that same id. Items are not rekeyed if a different id is returned.
     */
    create?(input: TRemote, params: SyncedSetParams<TRemote>): Promise<CrudResult<TRemote> | null | undefined | void>;
    update?(
        input: Partial<TRemote>,
        params: SyncedSetParams<TRemote>,
    ): Promise<CrudResult<Partial<TRemote> | null | undefined | void>>;
    delete?(input: TRemote, params: SyncedSetParams<TRemote>): Promise<any>;
    onSaved?(params: SyncedCrudOnSavedParams<TRemote, TLocal>): Partial<TLocal> | void;
    fieldId?: string;
    fieldUpdatedAt?: string;
    fieldCreatedAt?: string;
    fieldDeleted?: string;
    fieldDeletedList?: string;
    updatePartial?: boolean;
    changesSince?: 'all' | 'last-sync';
    generateId?: () => string | number;
    subscribe?: (params: SyncedSubscribeParams<TRemote[]>) => (() => void) | void;
    waitForSet?:
        | ((params: WaitForSetCrudFnParams<TLocal>) => any)
        | Promise<any>
        | ObservableParam<any>
        | ObservableEvent;
    onError?: (error: Error, params: CrudErrorParams) => void;
}

type InitialValue<TLocal, TAsOption extends CrudAsOption> = TAsOption extends 'Map'
    ? Map<string | number, TLocal>
    : TAsOption extends 'object'
      ? Record<string | number, TLocal>
      : TAsOption extends 'value'
        ? TLocal
        : TLocal[];

export type SyncedCrudReturnType<TLocal, TAsOption extends CrudAsOption> = TAsOption extends 'Map'
    ? Map<TLocal extends { id: number } ? number : string, TLocal>
    : TAsOption extends 'object'
      ? Record<TLocal extends { id: number } ? number : string, TLocal>
      : TAsOption extends 'value'
        ? TLocal
        : TLocal[];

function transformOut<T1, T2>(data: T1, transform: undefined | ((value: T1) => T2)) {
    return transform ? transform(clone(data)) : data;
}

function warnMissingId(value: any) {
    if (process.env.NODE_ENV === 'development') {
        console.warn('[legend-state] syncedCrud received an item without an id', value);
    }
}

function warnCreateIdMismatch(node: any, fieldId: string, localId: any, savedId: any) {
    const path: string[] = [];
    for (let n = node; n?.key !== undefined; n = n.parent) path.unshift(n.key);
    console.warn(
        `[legend-state] syncedCrud create at "${path.join('.') || '(root)'}" returned ${fieldId} ${JSON.stringify(savedId)} for an item created locally with ${fieldId} ${JSON.stringify(localId)}. The client generates ids (e.g. with generateId) and the server must persist and return that same id. The item is not rekeyed.`,
    );
}

function ensureId(obj: any, fieldId: string, generateId: () => string | number, node: any) {
    if (!obj[fieldId]) {
        obj[fieldId] = generateId();
        if (node) {
            setNodeValue(node, obj);
        }
    }
}

function computeLastSync(
    data: any[] | null | undefined,
    fieldUpdatedAt: string | undefined,
    fieldCreatedAt: string | undefined,
) {
    if (!isArray(data) || data.length === 0) {
        return 0;
    }

    let newLastSync = 0;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || typeof row !== 'object') {
            continue;
        }

        const updated =
            (fieldUpdatedAt ? (row as any)[fieldUpdatedAt as any] : 0) ||
            (fieldCreatedAt ? (row as any)[fieldCreatedAt as any] : 0);
        if (updated) {
            const updatedTime = +new Date(updated);
            if (!Number.isNaN(updatedTime)) {
                newLastSync = Math.max(newLastSync, updatedTime);
            }
        }
    }
    return newLastSync;
}

function arrayToRecord<T>(arr: T[], keyField: keyof T, getKey?: (value: T, index: number) => any): Record<string, T> {
    const record: Record<string, T> = {};
    if (arr?.length) {
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            const key = (getKey ? getKey(v, i) : v[keyField]) as string;
            if (isNullOrUndefined(key)) {
                warnMissingId(v);
            } else {
                record[key] = v;
            }
        }
    }
    return record;
}

type ItemKey = string | number;
type RetryAction = 'create' | 'update' | 'delete';

type QueuedRetry = RetryValue & { cancelled?: boolean; owner?: SyncedSetParams<any> };

type PendingCreate = {
    hasFailed: boolean;
    change?: ChangeWithPathStr;
    promise?: Promise<unknown>;
};

type RetryValue = {
    value: any;
    fullValue: any;
    localValue: any;
};

type QueuedRetries = Record<RetryAction, Map<ItemKey, QueuedRetry>>;

function mergeQueuedRetryValue(currentValue: any, nextValue: any) {
    if (currentValue && nextValue && typeof currentValue === 'object' && typeof nextValue === 'object') {
        Object.assign(currentValue, nextValue);
        return currentValue;
    }

    return nextValue;
}

function queueRetryValue(
    queuedRetries: Map<ItemKey, QueuedRetry>,
    itemKey: ItemKey,
    itemValue: any,
    itemValueFull: any,
    localValue: any,
) {
    const queuedRetry = queuedRetries.get(itemKey);
    if (queuedRetry) {
        queuedRetry.value = mergeQueuedRetryValue(queuedRetry.value, itemValue);
        queuedRetry.fullValue = mergeQueuedRetryValue(queuedRetry.fullValue, itemValueFull);
        queuedRetry.localValue = mergeQueuedRetryValue(queuedRetry.localValue, localValue);
        return queuedRetry;
    }

    const nextQueuedRetry: QueuedRetry = {
        value: itemValue,
        fullValue: itemValueFull,
        localValue,
    };
    queuedRetries.set(itemKey, nextQueuedRetry);
    return nextQueuedRetry;
}

function cancelQueuedRetry(queuedRetries: Map<ItemKey, QueuedRetry>, itemKey: ItemKey) {
    const queuedRetry = queuedRetries.get(itemKey);
    if (queuedRetry) {
        queuedRetry.cancelled = true;
        queuedRetries.delete(itemKey);
    }
}

function retrySet(
    params: SyncedSetParams<any>,
    retry: RetryOptions | undefined,
    action: RetryAction,
    itemKey: ItemKey,
    itemValue: any,
    changes: ChangeWithPathStr[],
    queuedRetries: QueuedRetries,
    itemValueFull: any,
    actionFn: (value: any, params: SyncedSetParams<any>) => Promise<any>,
    saveResult: (
        itemKey: ItemKey,
        itemValue: any,
        result: any,
        isCreate: boolean,
        changes: ChangeWithPathStr[],
        localValue: any,
    ) => void,
    options?: {
        localValue?: any;
        snapshotRemote?: boolean;
        onAttemptFailure?: () => void;
        refreshValue?: () => false | RetryValue | Promise<false | RetryValue | undefined> | undefined;
    },
) {
    // If delete then remove from create/update, and vice versa
    if (action === 'delete') {
        cancelQueuedRetry(queuedRetries.create, itemKey);
        cancelQueuedRetry(queuedRetries.update, itemKey);
    } else {
        cancelQueuedRetry(queuedRetries.delete, itemKey);
    }

    const queuedRetry = queueRetryValue(
        queuedRetries[action],
        itemKey,
        itemValue,
        itemValueFull,
        options?.localValue ?? itemValueFull,
    );

    const paramsWithChanges: SyncedSetParams<any> = { ...params, changes };
    queuedRetry.owner = paramsWithChanges;
    const cancelledResult = (result?: any) => {
        params.update({ value: {}, failedChanges: changes });
        return Promise.resolve(result);
    };

    const runAttempt = () => {
        if (queuedRetry.cancelled || queuedRetry.owner !== paramsWithChanges) {
            return cancelledResult();
        }

        const refreshed = options?.refreshValue?.();
        const runWithRefreshedValue = (retryValue?: false | RetryValue) => {
            if (queuedRetry.owner !== paramsWithChanges) return cancelledResult();
            if (retryValue === false || queuedRetry.cancelled) {
                queuedRetry.cancelled = true;
                if (queuedRetries[action]!.get(itemKey) === queuedRetry) queuedRetries[action]!.delete(itemKey);
                return cancelledResult();
            }

            if (retryValue) {
                queuedRetry.value = retryValue.value;
                queuedRetry.fullValue = retryValue.fullValue;
                queuedRetry.localValue = retryValue.localValue;
            }

            const attemptValue = queuedRetry.value;
            // Keep the local comparison domain separate from transforms and transport mutations.
            const attemptLocalValue = clone(queuedRetry.localValue);
            const attemptFullValue =
                queuedRetry.localValue === queuedRetry.fullValue
                    ? attemptLocalValue
                    : options?.snapshotRemote
                      ? clone(queuedRetry.fullValue)
                      : queuedRetry.fullValue;
            return actionFn!(attemptValue, paramsWithChanges)
                .catch((error) => {
                    options?.onAttemptFailure?.();
                    throw error;
                })
                .then(async (result) => {
                    if (queuedRetries[action]!.get(itemKey) === queuedRetry && queuedRetry.owner === paramsWithChanges)
                        queuedRetries[action]!.delete(itemKey);
                    if (queuedRetry.cancelled) {
                        return cancelledResult(result);
                    }
                    await saveResult(
                        itemKey,
                        attemptFullValue,
                        result as any,
                        action === 'create',
                        changes,
                        attemptLocalValue,
                    );
                    return result;
                });
        };

        return isPromise(refreshed) ? refreshed.then(runWithRefreshedValue) : runWithRefreshedValue(refreshed);
    };

    return runWithRetry(paramsWithChanges, retry, queuedRetry, runAttempt).catch((error) => {
        params.update({ value: {}, failedChanges: changes });
        throw error;
    });
}

// The no read version
export function syncedCrud<TRemote extends object, TLocal = TRemote, TAsOption extends CrudAsOption = 'object'>(
    props: SyncedCrudPropsNoRead<TRemote, TAsOption> & SyncedCrudPropsBase<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, TAsOption>;
// The get version
export function syncedCrud<TRemote extends object, TLocal = TRemote>(
    props: SyncedCrudPropsSingle<TRemote, TLocal> & SyncedCrudPropsBase<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, 'value'>;
// The list version
export function syncedCrud<TRemote extends object, TLocal = TRemote, TAsOption extends CrudAsOption = 'object'>(
    props: SyncedCrudPropsMany<TRemote, TLocal, TAsOption> & SyncedCrudPropsBase<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, Exclude<TAsOption, 'value'>>;
export function syncedCrud<TRemote extends object, TLocal = TRemote, TAsOption extends CrudAsOption = 'object'>(
    props: (SyncedCrudPropsSingle<TRemote, TLocal> | SyncedCrudPropsMany<TRemote, TLocal, TAsOption>) &
        SyncedCrudPropsBase<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, TAsOption>;
export function syncedCrud<TRemote extends object, TLocal = TRemote, TAsOption extends CrudAsOption = 'object'>(
    props: (
        | SyncedCrudPropsSingle<TRemote, TLocal>
        | SyncedCrudPropsMany<TRemote, TLocal, TAsOption>
        | SyncedCrudPropsNoRead<TRemote, TAsOption>
    ) &
        SyncedCrudPropsBase<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, TAsOption> {
    const {
        get: getFn,
        list: listFn,
        create: createFn,
        update: updateFn,
        delete: deleteFn,
        transform,
        fieldId: fieldIdProp,
        fieldCreatedAt,
        fieldUpdatedAt,
        fieldDeleted,
        fieldDeletedList,
        updatePartial,
        subscribe: subscribeProp,
        onSaved,
        mode: modeParam,
        changesSince,
        generateId,
        waitForSet: waitForSetParam,
        retry,
        ...rest
    } = props;

    const fieldId = fieldIdProp || 'id';
    const pendingCreates = new Map<ItemKey, PendingCreate>();
    const queuedRetries: QueuedRetries = {
        create: new Map<ItemKey, QueuedRetry>(),
        update: new Map<ItemKey, QueuedRetry>(),
        delete: new Map<ItemKey, QueuedRetry>(),
    };
    const beginPendingCreate = (id: ItemKey, change: ChangeWithPathStr) => {
        const pendingCreate = pendingCreates.get(id) || { hasFailed: false };
        pendingCreate.hasFailed = false;
        pendingCreate.change ||= change;
        pendingCreates.set(id, pendingCreate);
        return pendingCreate;
    };
    const clearPendingCreate = (id: ItemKey | undefined | null) => {
        if (!isNullOrUndefined(id)) {
            pendingCreates.delete(id);
            cancelQueuedRetry(queuedRetries.create, id);
        }
    };
    const cancelPendingCreate = (id: ItemKey | undefined | null) => {
        const pendingCreate = !isNullOrUndefined(id) ? pendingCreates.get(id) : undefined;
        if (pendingCreate && (pendingCreate.hasFailed || !pendingCreate.promise)) {
            clearPendingCreate(id);
            return true;
        }
        return false;
    };
    const clearPendingCreateForValue = (value: any) => {
        if (value && typeof value === 'object') {
            clearPendingCreate(value[fieldId]);
        }
    };
    const clearPendingCreatesForValues = (values: any[] | null | undefined) => {
        if (values?.length) {
            for (let i = 0; i < values.length; i++) {
                clearPendingCreateForValue(values[i]);
            }
        }
    };
    const markPendingCreateFailed = (itemKey: ItemKey) => {
        const pendingCreate = pendingCreates.get(itemKey);
        if (pendingCreate && !pendingCreate.hasFailed) {
            pendingCreate.hasFailed = true;
            cancelQueuedRetry(queuedRetries.update, itemKey);
            cancelQueuedRetry(queuedRetries.delete, itemKey);
        }
    };

    let asType = props.as as TAsOption;

    if (!asType) {
        asType = (getFn ? 'value' : 'object') as CrudAsOption as TAsOption;
    }

    const asMap = asType === 'Map';
    const asArray = asType === 'array';
    let warnedArray = false;

    const resultsToOutType = (results: any[]) => {
        if (asType === 'value') {
            return results[0];
        }
        const out = asType === 'array' ? [] : asMap ? new Map() : {};
        for (let i = 0; i < results.length; i++) {
            let result = results[i];
            const value = result;
            if (value) {
                // Replace any children with symbolDelete or fieldDeleted with symbolDelete
                result =
                    (fieldDeleted && result[fieldDeleted as any]) ||
                    (fieldDeletedList && result[fieldDeletedList]) ||
                    result[symbolDelete]
                        ? internal.symbolDelete
                        : result;
                if (asArray) {
                    (out as any[]).push(result);
                } else if (asMap) {
                    const key = value[fieldId];
                    if (isNullOrUndefined(key)) {
                        warnMissingId(value);
                    } else {
                        (out as Map<string, any>).set(key, result);
                    }
                } else {
                    const key = value[fieldId];
                    if (isNullOrUndefined(key)) {
                        warnMissingId(value);
                    } else {
                        (out as Record<string, any>)[key] = result;
                    }
                }
            }
        }
        return out;
    };

    const transformRows = (data: TRemote[]) => {
        return data.length
            ? Promise.all(
                  data.map((value: any) =>
                      // Skip transforming any children with symbolDelete or fieldDeleted because they'll get deleted by resultsToOutType
                      value[symbolDelete] ||
                      (fieldDeleted && value[fieldDeleted]) ||
                      (fieldDeletedList && value[fieldDeletedList])
                          ? value
                          : transform!.load!(value, 'get'),
                  ),
              )
            : [];
    };

    const get: undefined | ((params: SyncedGetParams<TRemote>) => TLocal | Promise<TLocal>) =
        getFn || listFn
            ? (getParams: SyncedGetParams<TRemote>) => {
                  return runWithRetry(getParams, retry, queuedRetries, () => {
                      const { updateLastSync, lastSync, value } = getParams;
                      if (listFn) {
                          const isLastSyncMode = changesSince === 'last-sync';
                          if (isLastSyncMode && lastSync) {
                              getParams.mode =
                                  modeParam || (asType === 'array' ? 'append' : asType === 'value' ? 'set' : 'assign');
                          }

                          const listPromise = listFn(getParams);

                          // Note: We don't want this function to be async so we return these functions
                          // as Promise only if listFn returned a promise
                          const toOut = (transformed: TLocal[]) => {
                              if (asType === 'value') {
                                  if (transformed.length > 0) {
                                      // Return first value
                                      return transformed[0];
                                  } else {
                                      // Return null if no cached value, otherwise undefined to not overwrite it
                                      return value ? undefined : null;
                                  }
                              } else {
                                  return resultsToOutType(transformed);
                              }
                          };

                          const processResults = (data: TRemote[] | null) => {
                              data ||= [];
                              clearPendingCreatesForValues(data);
                              if (fieldUpdatedAt) {
                                  const newLastSync = computeLastSync(data, fieldUpdatedAt, fieldCreatedAt!);

                                  if (newLastSync && newLastSync !== lastSync) {
                                      updateLastSync(newLastSync);
                                  }
                              }
                              let transformed = data as unknown as TLocal[] | Promise<TLocal[]>;

                              if (transform?.load) {
                                  transformed = transformRows(data);
                              }

                              return isPromise(transformed) ? transformed.then(toOut) : toOut(transformed);
                          };

                          return isPromise(listPromise)
                              ? listPromise.then(processResults)
                              : processResults(listPromise);
                      } else if (getFn) {
                          const dataPromise = getFn(getParams);

                          // Note: We don't want this function to be async so we return these functions
                          // as Promise only if getFn returned a promise
                          const processData = (data: TRemote | null) => {
                              if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                                  if (!warnedArray && isArray(data) && data[0] && typeof data[0] === 'object') {
                                      warnedArray = true;
                                      console.warn(
                                          '[legend-state] syncedCrud get returned an array of items, but get syncs a single item. Arrays are not supported for per-item sync; use list (as an object or Map keyed by id) instead.',
                                      );
                                  }
                              }
                              clearPendingCreateForValue(data);
                              let transformed = data as unknown as TLocal | Promise<TLocal>;
                              if (data) {
                                  const newLastSync =
                                      (data as any)[fieldUpdatedAt as any] || (data as any)[fieldCreatedAt as any];
                                  if (newLastSync && newLastSync !== lastSync) {
                                      updateLastSync(newLastSync);
                                  }
                                  if (transform?.load) {
                                      transformed = transform.load(data, 'get');
                                  }
                              }

                              return transformed as any;
                          };

                          return isPromise(dataPromise) ? dataPromise.then(processData) : processData(dataPromise);
                      }
                  });
              }
            : undefined;

    const set =
        createFn || updateFn || deleteFn
            ? async (params: SyncedSetParams<any> & { retryAsCreate?: boolean }) => {
                  const { value, changes, update, retryAsCreate, node } = params;
                  const creates = new Map<ItemKey, TLocal>();
                  const updates = new Map<ItemKey, object>();
                  const updateFullValues = new Map<ItemKey, object>();
                  const deletes = new Set<TRemote>();
                  const changesById = new Map<ItemKey, ChangeWithPathStr[]>();
                  const addChange = (id: ItemKey, change: ChangeWithPathStr) => {
                      const changes = changesById.get(id);
                      if (changes) {
                          if (!changes.includes(change)) changes.push(change);
                      } else {
                          changesById.set(id, [change]);
                      }
                  };

                  const getUpdateValue = (itemValue: object, prev: object, changedKey?: string) => {
                      return updatePartial
                          ? Object.assign(
                                changedKey === undefined
                                    ? diffObjects(prev, itemValue, /*deep*/ true)
                                    : { [changedKey]: (itemValue as any)[changedKey] },
                                !isNullOrUndefined((itemValue as any)[fieldId])
                                    ? { [fieldId]: (itemValue as any)[fieldId] }
                                    : {},
                            )
                          : itemValue;
                  };

                  const getCurrentValueAtKey = (itemKey: ItemKey) => {
                      const currentPeeked = getNodeValue(node);
                      if (asType === 'value') {
                          return currentPeeked?.[fieldId] === itemKey ? currentPeeked : undefined;
                      }
                      if (asType === 'array') {
                          return isArray(currentPeeked)
                              ? currentPeeked.find((value: any) => value?.[fieldId] === itemKey)
                              : undefined;
                      }
                      if (asType === 'Map') {
                          return currentPeeked?.get(itemKey);
                      }
                      return currentPeeked?.[itemKey];
                  };

                  const isFailedCreateReadyToRetry = (itemKey: ItemKey) => {
                      const pendingCreate = pendingCreates.get(itemKey);
                      return !!pendingCreate?.hasFailed && !pendingCreate.promise;
                  };
                  const addCreate = (id: ItemKey, itemValue: TLocal, change: ChangeWithPathStr) => {
                      const existingPendingCreate = pendingCreates.get(id);
                      if (
                          existingPendingCreate?.hasFailed &&
                          !existingPendingCreate.promise &&
                          change.path.length === 0
                      ) {
                          existingPendingCreate.change = change;
                      }
                      const pendingCreate = beginPendingCreate(id, change);
                      addChange(id, pendingCreate.change!);
                      addChange(id, change);
                      creates.set(id, itemValue);
                  };

                  const valueNeedsCreate =
                      asType === 'value' &&
                      (isNullOrUndefined(value?.[fieldId]) ||
                          changes.some(
                              (change) =>
                                  change.path.length === 1 &&
                                  change.path[0] === fieldId &&
                                  isNullOrUndefined(change.prevAtPath),
                          ));
                  changes.forEach((change) => {
                      const { path, prevAtPath, valueAtPath } = change;
                      if (asType === 'value') {
                          const previousId = path.length === 0 ? prevAtPath?.[fieldId] : undefined;
                          let isCreate = fieldCreatedAt
                              ? !value?.[fieldCreatedAt!]
                              : path.length === 0
                                ? !prevAtPath
                                : valueNeedsCreate || (!updateFn && !prevAtPath);
                          if (
                              !isNullOrUndefined(previousId) &&
                              isNullOrUndefined(valueAtPath) &&
                              !queuedRetries.delete.has(previousId) &&
                              !cancelPendingCreate(previousId)
                          ) {
                              deletes.add(prevAtPath);
                              addChange(previousId, change);
                          }
                          if (path.length === 0 && isNullOrUndefined(valueAtPath)) return;
                          if (value) {
                              if (isNullOrUndefined(value[fieldId]) && generateId) {
                                  ensureId(value, fieldId, generateId, node);
                              }
                              const id = value[fieldId];
                              if (!isNullOrUndefined(id)) {
                                  addChange(id, change);
                                  if (isFailedCreateReadyToRetry(id) || creates.has(id)) {
                                      isCreate = true;
                                  } else if (pendingCreates.has(id)) {
                                      isCreate = false;
                                  }
                                  if (isCreate || retryAsCreate) {
                                      if (createFn) {
                                          addCreate(id, value, change);
                                      } else {
                                          console.warn('[legend-state] missing create function');
                                      }
                                  } else if (path.length === 0) {
                                      if (valueAtPath) {
                                          updates.set(id, getUpdateValue(valueAtPath, prevAtPath));
                                          updateFullValues.set(id, valueAtPath);
                                      }
                                  } else {
                                      const changed = getUpdateValue(value, value, path[0]);
                                      updates.set(
                                          id,
                                          updates.has(id) ? Object.assign(updates.get(id)!, changed) : changed,
                                      );
                                      updateFullValues.set(id, value);
                                  }
                              } else {
                                  console.error('[legend-state]: added synced item without an id');
                              }
                          }
                      } else {
                          // value, previous, fullValue
                          let itemsChanged: [any, any, any][] | undefined = [];
                          if (path.length === 0) {
                              // Generate ids before converting to object
                              if (asArray && generateId) {
                                  for (let i = 0; i < value.length; i++) {
                                      const item = value[i];
                                      if (item && !item[fieldId]) {
                                          ensureId(item, fieldId, generateId, getChildNode(node, i + ''));
                                      }
                                  }
                              }

                              // Preserve record key order and duplicate handling when iterating arrays directly.
                              let alignedArrays =
                                  asArray &&
                                  isArray(value) &&
                                  isArray(prevAtPath) &&
                                  value.length === prevAtPath.length;
                              let alignedPrefix = 0;
                              let lastPreviousIndex = -1;
                              let lastPreviousId: any;
                              if (alignedArrays) {
                                  let stringIds: Set<string> | undefined;
                                  let previousIndex = -1;
                                  let sawStringKey = false;
                                  for (let i = 0; i < value.length; i++) {
                                      const id = value[i]?.[fieldId];
                                      const previousId = prevAtPath[i]?.[fieldId];
                                      lastPreviousIndex = i;
                                      lastPreviousId = previousId;
                                      if (
                                          (typeof id !== 'string' && typeof id !== 'number') ||
                                          (typeof previousId !== 'string' && typeof previousId !== 'number')
                                      ) {
                                          alignedArrays = false;
                                          break;
                                      }
                                      const key = String(id);
                                      if (key === '__proto__' || key !== String(previousId)) {
                                          alignedArrays = false;
                                          break;
                                      }
                                      const index = Number(key);
                                      const isIndex =
                                          Number.isInteger(index) &&
                                          index >= 0 &&
                                          index < 4294967295 &&
                                          String(index) === key;
                                      if (isIndex && (sawStringKey || index <= previousIndex)) {
                                          alignedArrays = false;
                                          break;
                                      }
                                      if (isIndex) previousIndex = index;
                                      else {
                                          if (stringIds?.has(key)) {
                                              alignedArrays = false;
                                              break;
                                          }
                                          (stringIds ||= new Set()).add(key);
                                          sawStringKey = true;
                                      }
                                      alignedPrefix++;
                                  }
                              }
                              // Root changes must use the same isolated snapshot as child changes.
                              const valueAsObject = asArray && !alignedArrays ? arrayToRecord(value, fieldId) : value;
                              // Reuse validated IDs so fallback does not reread previous getters.
                              const prevAsObject =
                                  asArray && !alignedArrays
                                      ? arrayToRecord(
                                            prevAtPath,
                                            fieldId,
                                            lastPreviousIndex < 0
                                                ? undefined
                                                : (row, index) =>
                                                      index < alignedPrefix
                                                          ? value[index][fieldId]
                                                          : index === lastPreviousIndex
                                                            ? lastPreviousId
                                                            : row[fieldId],
                                        )
                                      : prevAtPath;
                              // Do a deep equal of each element vs its previous element to see which have changed
                              const keys = alignedArrays ? undefined : getKeys(valueAsObject, false, asMap, false);
                              const keysPrev = alignedArrays ? undefined : getKeys(prevAsObject, false, asMap, false);
                              const length = (keys || valueAsObject)?.length || 0;
                              const lengthPrev = alignedArrays ? 0 : (keysPrev || prevAsObject)?.length || 0;

                              for (let i = 0; i < lengthPrev; i++) {
                                  const key = keysPrev![i];
                                  if (
                                      !valueAsObject ||
                                      (asMap
                                          ? !valueAsObject.has(key)
                                          : !Object.prototype.propertyIsEnumerable.call(valueAsObject, key))
                                  ) {
                                      const prevValue = asMap ? prevAsObject.get(key) : prevAsObject[key];
                                      const id = prevValue?.[fieldId];
                                      if (!cancelPendingCreate(id)) {
                                          deletes.add(prevValue);
                                          addChange(id, change);
                                      }
                                  }
                              }

                              for (let i = 0; i < length; i++) {
                                  const key = alignedArrays ? i : keys![i];
                                  const value = asMap ? valueAsObject.get(key) : valueAsObject[key];
                                  const prev = prevAsObject
                                      ? asMap
                                          ? prevAsObject.get(key)
                                          : prevAsObject[key]
                                      : undefined;
                                  if (isNullOrUndefined(value) && !isNullOrUndefined(prev)) {
                                      deletes.add(prev);
                                      addChange(prev[fieldId], change);
                                  } else {
                                      const isDiff = !prevAsObject || !deepEqual(value, prev);
                                      const isFailedCreateRetry = isFailedCreateReadyToRetry(value?.[fieldId]);

                                      if (isDiff || isFailedCreateRetry) {
                                          itemsChanged.push([getUpdateValue(value, prev), prev, value]);
                                      }
                                  }
                              }
                          } else {
                              const itemKey = path[0];
                              const itemValue = asMap ? value.get(itemKey) : value[itemKey];
                              if (!itemValue) {
                                  if (path.length === 1 && prevAtPath) {
                                      const id = prevAtPath[fieldId];
                                      if (!cancelPendingCreate(id)) {
                                          deletes.add(prevAtPath);
                                          addChange(id, change);
                                      }
                                  }
                              } else {
                                  if (generateId) {
                                      ensureId(itemValue, fieldId, generateId, getChildNode(node, itemKey + ''));
                                  }
                                  const previous =
                                      path.length === 1
                                          ? prevAtPath
                                          : path.length === 2
                                            ? { ...itemValue, [path[1]]: prevAtPath }
                                            : itemValue;
                                  itemsChanged = [
                                      [
                                          getUpdateValue(itemValue, previous, path.length > 1 ? path[1] : undefined),
                                          previous,
                                          itemValue,
                                      ],
                                  ];
                              }
                          }
                          itemsChanged?.forEach(([item, prev, fullValue]) => {
                              const id = item[fieldId];
                              const isFailedCreateRetry = isFailedCreateReadyToRetry(id);
                              const isCreate =
                                  isFailedCreateRetry ||
                                  creates.has(id) ||
                                  (!pendingCreates.has(id) &&
                                      (isNullOrUndefined(prev) ||
                                          (fieldCreatedAt
                                              ? isNullOrUndefined(prev[fieldCreatedAt])
                                              : fieldUpdatedAt
                                                ? isNullOrUndefined(prev[fieldUpdatedAt])
                                                : false)));
                              if (isCreate) {
                                  if (!id) {
                                      console.error('[legend-state]: added item without an id');
                                  }
                                  if (createFn) {
                                      addCreate(id, fullValue, change);
                                  } else {
                                      console.warn('[legend-state] missing create function');
                                  }
                              } else {
                                  if (updateFn) {
                                      const id = item[fieldId];
                                      addChange(id, change);
                                      updates.set(id, updates.has(id) ? Object.assign(updates.get(id)!, item) : item);
                                      updateFullValues.set(
                                          id,
                                          updateFullValues.has(id)
                                              ? Object.assign(updateFullValues.get(id)!, fullValue)
                                              : fullValue,
                                      );
                                  } else {
                                      console.warn('[legend-state] missing update function');
                                  }
                              }
                          });
                      }
                  });

                  let changesToAck: Set<ChangeWithPathStr> | undefined = new Set(changes);
                  const acknowledge = (changes: ChangeWithPathStr[]) => {
                      if (changesToAck) changes.forEach((change) => changesToAck!.add(change));
                      else update({ value: {}, changes });
                  };
                  const requestCount = creates.size + updates.size + deletes.size;
                  const confirmCreate =
                      creates.size && asType !== 'value' ? internalSync.captureCrudCreate(params) : undefined;
                  const syncStateValue = onSaved ? getNodeValue(getNode(node.state!)) : undefined;
                  const applySaved = (
                      itemKey: ItemKey,
                      saved: Partial<TLocal>,
                      changes: ChangeWithPathStr[],
                      localValue: TLocal,
                  ) => {
                      const currentValue = getCurrentValueAtKey(itemKey);
                      if (isNullOrUndefined(currentValue)) {
                          acknowledge(changes);
                          return;
                      }
                      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                          if (!warnedArray && isArray(saved)) {
                              warnedArray = true;
                              console.warn(
                                  '[legend-state] syncedCrud create or update returned an array, but it should return the saved row (e.g. data[0] instead of data). Arrays are not supported for per-item sync.',
                              );
                          }
                      }
                      // Remove keys modified locally since this save started.
                      Object.keys(saved).forEach((key) => {
                          const i = (localValue as any)[key];
                          const c = currentValue[key];
                          if (
                              // value is already the new value, can ignore
                              deepEqual((saved as any)[key], c) ||
                              // Out-of-order responses must not roll server timestamps backward.
                              (key === fieldUpdatedAt && +new Date((saved as any)[key]) < +new Date(c)) ||
                              // user has changed local value
                              (key !== fieldId && key !== fieldUpdatedAt && key !== fieldCreatedAt && !deepEqual(i, c))
                          ) {
                              delete (saved as any)[key];
                          }
                      });

                      if (Object.keys(saved).length === 0) {
                          acknowledge(changes);
                          return;
                      }
                      let value: any;
                      if (asType === 'array') {
                          const currentPeeked = getNodeValue(node);
                          const index = (currentPeeked as any[]).findIndex((cur: any) => cur[fieldId] === itemKey);
                          if (index < 0) {
                              console.warn('[legend-state] Item saved that does not exist in array', saved);
                          } else {
                              value = { [index]: saved };
                          }
                      } else {
                          value = asMap
                              ? new Map([[itemKey, saved]])
                              : itemKey !== 'undefined' && asType !== 'value'
                                ? { [itemKey]: saved }
                                : saved;
                      }

                      if (value !== undefined) {
                          update({
                              value,
                              mode: 'merge',
                              changes,
                          });
                      }
                  };
                  // Other callbacks can come from this batch or another in-flight set.
                  let savedResults: Parameters<typeof applySaved>[] | undefined = onSaved ? [] : undefined;
                  const saveResult = async (
                      itemKey: ItemKey,
                      input: TRemote,
                      data: CrudResult<TRemote>,
                      isCreate: boolean,
                      changes: ChangeWithPathStr[],
                      localValue: TLocal,
                  ) => {
                      if (
                          asType === 'value' &&
                          changes.some((change) => !change.path.length && change.valueAtPath?.[fieldId] === itemKey)
                      ) {
                          changes = changes.map((change) =>
                              !change.path.length && change.valueAtPath?.[fieldId] === itemKey
                                  ? { ...change, valueAtPath: localValue }
                                  : change,
                          );
                      }
                      if (isCreate) confirmCreate?.(itemKey);
                      let saved: Partial<TLocal> | undefined = data
                          ? ((transform?.load ? await transform.load(data as any, 'set') : data) as any)
                          : undefined;
                      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                          const savedId = isCreate && saved ? (saved as any)[fieldId] : undefined;
                          if (!isNullOrUndefined(savedId) && savedId !== itemKey) {
                              warnCreateIdMismatch(node, fieldId, itemKey, savedId);
                          }
                      }
                      if (saved && onSaved) {
                          const currentValue = getCurrentValueAtKey(itemKey);
                          if (isNullOrUndefined(currentValue)) {
                              acknowledge(changes);
                              return;
                          }
                          const ret = onSaved({
                              saved: saved as TLocal,
                              input: input === (localValue as unknown) ? clone(input) : input,
                              currentValue,
                              isCreate,
                              props,
                          });
                          if (ret) saved = ret;
                      }
                      saved = saved ? clone(saved) : undefined;
                      if (saved && typeof saved === 'object') {
                          if (savedResults && (requestCount > 1 || syncStateValue.numPendingSets > 1)) {
                              savedResults.push([itemKey, saved, changes, localValue]);
                          } else {
                              applySaved(itemKey, saved, changes, localValue);
                          }
                      } else {
                          acknowledge(changes);
                      }
                  };

                  return Promise.allSettled([
                      // Handle creates
                      ...Array.from(creates).map(async ([itemKey, itemValue]) => {
                          changesById.get(itemKey)!.forEach((change) => changesToAck!.delete(change));
                          const pendingCreate = pendingCreates.get(itemKey)!;
                          if (waitForSetParam) {
                              await waitForSet(waitForSetParam as any, changes, itemValue, { type: 'create' });
                          }
                          const createObj = (await transformOut(itemValue as any, transform?.save)) as TRemote;
                          if (pendingCreates.get(itemKey) !== pendingCreate) {
                              params.update({ value: {}, failedChanges: changesById.get(itemKey)! });
                              return;
                          }
                          const refreshCreateValue = async () => {
                              const currentPendingCreate = pendingCreates.get(itemKey);
                              if (currentPendingCreate !== pendingCreate) {
                                  return false;
                              }
                              if (!currentPendingCreate.hasFailed) {
                                  return undefined;
                              }
                              const currentValue = getCurrentValueAtKey(itemKey);
                              if (isNullOrUndefined(currentValue)) {
                                  clearPendingCreate(itemKey);
                                  return false;
                              }
                              const localValue = clone(currentValue);
                              const nextCreateObj = (await transformOut(localValue, transform?.save)) as TRemote;
                              return { value: nextCreateObj, fullValue: nextCreateObj, localValue };
                          };
                          const createPromise = retrySet(
                              params,
                              retry,
                              'create',
                              itemKey,
                              createObj,
                              changesById.get(itemKey)!,
                              queuedRetries,
                              createObj,
                              createFn!,
                              saveResult,
                              {
                                  localValue: itemValue,
                                  snapshotRemote: !!onSaved,
                                  onAttemptFailure: () => markPendingCreateFailed(itemKey),
                                  refreshValue: refreshCreateValue,
                              },
                          );
                          pendingCreate.promise = createPromise;
                          return createPromise
                              .then((result) => {
                                  if (pendingCreates.get(itemKey) === pendingCreate) {
                                      pendingCreates.delete(itemKey);
                                  }
                                  return result;
                              })
                              .catch((error) => {
                                  if (pendingCreates.get(itemKey) === pendingCreate) {
                                      pendingCreate.promise = undefined;
                                  }
                                  throw error;
                              });
                      }),

                      // Handle updates
                      ...Array.from(updates).map(async ([itemKey, itemValue]) => {
                          changesById.get(itemKey)!.forEach((change) => changesToAck!.delete(change));
                          const pendingCreate = pendingCreates.get(itemKey);
                          if (pendingCreate?.hasFailed && pendingCreate.promise) {
                              await pendingCreate.promise;
                          }
                          const fullValue = updateFullValues.get(itemKey);
                          if (waitForSetParam) {
                              // waitForSet should receive the full value
                              await waitForSet(waitForSetParam as any, changes, fullValue, { type: 'update' });
                          }
                          const changed = (await transformOut(itemValue as TLocal, transform?.save)) as TRemote;
                          const fullValueTransformed =
                              itemValue === fullValue
                                  ? changed
                                  : ((await transformOut(fullValue as TLocal, transform?.save)) as TRemote);
                          if (Object.keys(changed).length > 0) {
                              return retrySet(
                                  params,
                                  retry,
                                  'update',
                                  itemKey,
                                  changed,
                                  changesById.get(itemKey)!,
                                  queuedRetries,
                                  fullValueTransformed,
                                  updateFn!,
                                  saveResult,
                                  { localValue: fullValue, snapshotRemote: !!onSaved },
                              );
                          }
                          acknowledge(changesById.get(itemKey)!);
                      }),

                      // Handle deletes
                      ...Array.from(deletes)
                          .filter((val) => val !== (symbolDelete as any))
                          .map(async (valuePrevious) => {
                              const itemKey = (valuePrevious as any)[fieldId];
                              if (isNullOrUndefined(itemKey)) return;
                              if (deleteFn || (fieldDeleted && updateFn)) {
                                  changesById.get(itemKey)!.forEach((change) => changesToAck!.delete(change));
                              }
                              if (waitForSetParam) {
                                  await waitForSet(waitForSetParam as any, changes, valuePrevious, { type: 'delete' });
                              }
                              if (deleteFn) {
                                  return retrySet(
                                      params,
                                      retry,
                                      'delete',
                                      itemKey,
                                      valuePrevious,
                                      changesById.get(itemKey)!,
                                      queuedRetries,
                                      valuePrevious,
                                      deleteFn!,
                                      saveResult,
                                  );
                              }

                              if (fieldDeleted && updateFn) {
                                  const value = { [fieldId]: itemKey, [fieldDeleted]: true } as any;
                                  return retrySet(
                                      params,
                                      retry,
                                      'delete',
                                      itemKey,
                                      value,
                                      changesById.get(itemKey)!,
                                      queuedRetries,
                                      value,
                                      updateFn!,
                                      saveResult,
                                  );
                              }

                              console.warn('[legend-state] missing delete function');
                          }),
                  ])
                      .then((results) => {
                          const failed = results.find((result) => result.status === 'rejected');
                          if (failed) throw failed.reason;
                      })
                      .finally(() => {
                          // Callbacks can edit other rows whose responses have already completed.
                          const results = savedResults;
                          savedResults = undefined;
                          results?.forEach((result) => applySaved(...result));
                          const acknowledged = changesToAck;
                          changesToAck = undefined;
                          if (acknowledged?.size) update({ value: {}, changes: Array.from(acknowledged) });
                      });
              }
            : undefined;

    const subscribe: SyncedOptions['subscribe'] = subscribeProp
        ? (params: SyncedSubscribeParams) =>
              subscribeProp({
                  ...params,
                  update: async (paramsUpdate) => {
                      const paramsForUpdate: UpdateFnParams<any> = paramsUpdate as any;

                      const rows = paramsUpdate.value as any[];

                      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                          if (!isArray(rows)) {
                              console.error('[legend-state] subscribe:update expects an array of changed items');
                          }
                      }

                      const newLastSync = computeLastSync(rows, fieldUpdatedAt, fieldCreatedAt);
                      if (newLastSync) {
                          paramsForUpdate.lastSync = newLastSync;
                      }

                      const rowsTransformed = transform?.load ? await transformRows(rows) : rows;
                      clearPendingCreatesForValues(rows);

                      paramsForUpdate.value = resultsToOutType(rowsTransformed);
                      params.update(paramsForUpdate);
                  },
              })
        : undefined;

    return synced<any>({
        set,
        get,
        subscribe,
        mode: modeParam,
        fieldId: asType === 'array' || asType === 'value' ? fieldId : undefined,
        ...(rest as any),
    });
}
