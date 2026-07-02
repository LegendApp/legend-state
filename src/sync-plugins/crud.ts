import {
    ChangeWithPathStr,
    ObservableEvent,
    ObservableParam,
    RetryOptions,
    UpdateFnParams,
    WaitForSetFnParams,
    applyChanges,
    getNodeValue,
    internal,
    isArray,
    isNullOrUndefined,
    isPromise,
    setAtPath,
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

const { clone, getKeys, setNodeValue, getChildNode } = internal;
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

function arrayToRecord<T>(arr: T[], keyField: keyof T): Record<string, T> {
    const record: Record<string, T> = {};
    if (arr?.length) {
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            const key = v[keyField] as string;
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

type QueuedRetry = {
    value: any;
    fullValue: any;
    cancelled?: boolean;
};

type PendingCreate = {
    hasFailed: boolean;
    change?: ChangeWithPathStr;
    promise?: Promise<unknown>;
};

type RetryValue = {
    value: any;
    fullValue: any;
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
) {
    const queuedRetry = queuedRetries.get(itemKey);
    if (queuedRetry) {
        queuedRetry.value = mergeQueuedRetryValue(queuedRetry.value, itemValue);
        queuedRetry.fullValue = mergeQueuedRetryValue(queuedRetry.fullValue, itemValueFull);
        return queuedRetry;
    }

    const nextQueuedRetry: QueuedRetry = {
        value: itemValue,
        fullValue: itemValueFull,
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
    change: ChangeWithPathStr,
    queuedRetries: QueuedRetries,
    itemValueFull: any,
    actionFn: (value: any, params: SyncedSetParams<any>) => Promise<any>,
    saveResult: (itemKey: ItemKey, itemValue: any, result: any, isCreate: boolean, change: ChangeWithPathStr) => void,
    options?: {
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

    const queuedRetry = queueRetryValue(queuedRetries[action], itemKey, itemValue, itemValueFull);

    const paramsWithChanges: SyncedSetParams<any> = { ...params, changes: [change] };

    const runAttempt = () => {
        if (queuedRetry.cancelled) {
            return Promise.resolve(undefined as any);
        }

        const refreshed = options?.refreshValue?.();
        const runWithRefreshedValue = (retryValue?: false | RetryValue) => {
            if (retryValue === false || queuedRetry.cancelled) {
                queuedRetry.cancelled = true;
                queuedRetries[action]!.delete(itemKey);
                return Promise.resolve(undefined as any);
            }

            if (retryValue) {
                queuedRetry.value = retryValue.value;
                queuedRetry.fullValue = retryValue.fullValue;
            }

            const attemptValue = queuedRetry.value;
            const attemptFullValue = clone(queuedRetry.fullValue);
            return actionFn!(attemptValue, paramsWithChanges)
                .catch((error) => {
                    options?.onAttemptFailure?.();
                    throw error;
                })
                .then(async (result) => {
                    queuedRetries[action]!.delete(itemKey);
                    if (queuedRetry.cancelled) {
                        return result;
                    }
                    await saveResult(itemKey, attemptFullValue, result as any, true, change);
                    return result;
                });
        };

        return isPromise(refreshed) ? refreshed.then(runWithRefreshedValue) : runWithRefreshedValue(refreshed);
    };

    return runWithRetry(paramsWithChanges, retry, action + '_' + itemKey, runAttempt);
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
    const cancelFailedPendingCreate = (id: ItemKey | undefined | null) => {
        if (!isNullOrUndefined(id) && pendingCreates.get(id)?.hasFailed) {
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
                  return runWithRetry(getParams, retry, getFn || listFn, () => {
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
                  const changesById = new Map<ItemKey, ChangeWithPathStr>();

                  const getUpdateValue = (itemValue: object, prev: object) => {
                      return updatePartial
                          ? Object.assign(
                                diffObjects(prev, itemValue, /*deep*/ true),
                                !isNullOrUndefined((itemValue as any)[fieldId])
                                    ? { [fieldId]: (itemValue as any)[fieldId] }
                                    : {},
                            )
                          : itemValue;
                  };

                  const getCurrentValueAtKey = (itemKey: ItemKey) => {
                      const currentPeeked = getNodeValue(node);
                      if (asType === 'value') {
                          return currentPeeked;
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
                      const pendingCreate = beginPendingCreate(id, change);
                      changesById.set(id, pendingCreate.change!);
                      creates.set(id, itemValue);
                  };

                  changes.forEach((change) => {
                      const { path, prevAtPath, valueAtPath, pathTypes } = change;
                      if (asType === 'value') {
                          if (value) {
                              let isCreate = fieldCreatedAt ? !value[fieldCreatedAt!] : !prevAtPath;
                              if (isNullOrUndefined(value[fieldId]) && generateId) {
                                  ensureId(value, fieldId, generateId, node);
                              }
                              const id = value[fieldId];
                              if (!isNullOrUndefined(id)) {
                                  changesById.set(id, change);
                                  if (isFailedCreateReadyToRetry(id)) {
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
                                      } else if (prevAtPath) {
                                          deletes.add(prevAtPath);
                                      }
                                  } else if (!updates.has(id)) {
                                      const previous = applyChanges(clone(value), changes, /*applyPrevious*/ true);
                                      updates.set(id, getUpdateValue(value, previous));
                                      updateFullValues.set(id, value);
                                  }
                              } else {
                                  console.error('[legend-state]: added synced item without an id');
                              }
                          } else if (path.length === 0) {
                              const id = prevAtPath?.[fieldId];
                              if (!cancelFailedPendingCreate(id)) {
                                  deletes.add(prevAtPath);
                                  changesById.set(prevAtPath[fieldId], change);
                              }
                          }
                      } else {
                          // value, previous, fullValue
                          let itemsChanged: [any, any, any][] | undefined = [];
                          if (path.length === 0) {
                              // Generate ids before converting to object
                              if (asArray && generateId) {
                                  for (let i = 0; i < valueAtPath.length; i++) {
                                      const value = valueAtPath[i];
                                      if (value && !value[fieldId]) {
                                          ensureId(value, fieldId, generateId, getChildNode(node, i + ''));
                                      }
                                  }
                              }

                              const valueAsObject = asArray ? arrayToRecord(valueAtPath, fieldId) : valueAtPath;
                              const prevAsObject = asArray ? arrayToRecord(prevAtPath, fieldId) : prevAtPath;
                              // Do a deep equal of each element vs its previous element to see which have changed
                              const keys = getKeys(valueAsObject, false, asMap, false);
                              const keysPrev = getKeys(prevAsObject, false, asMap, false);
                              const keysSet = new Set<number | string>(keys);
                              const length = (keys || valueAsObject)?.length || 0;
                              const lengthPrev = (keysPrev || prevAsObject)?.length || 0;

                              for (let i = 0; i < lengthPrev; i++) {
                                  const key = keysPrev[i];
                                  if (!keysSet.has(key)) {
                                      const prevValue = prevAsObject[key];
                                      const id = prevValue?.[fieldId];
                                      if (!cancelFailedPendingCreate(id)) {
                                          deletes.add(prevValue);
                                      }
                                  }
                              }

                              for (let i = 0; i < length; i++) {
                                  const key = keys[i];
                                  const value = asMap ? valueAsObject.get(key) : valueAsObject[key];
                                  const prev = prevAsObject
                                      ? asMap
                                          ? prevAsObject.get(key)
                                          : prevAsObject[key]
                                      : undefined;
                                  if (isNullOrUndefined(value) && !isNullOrUndefined(prev)) {
                                      deletes.add(prev);
                                      return false;
                                  } else {
                                      const isDiff = !prevAsObject || !deepEqual(value, prev);

                                      if (isDiff) {
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
                                      if (!cancelFailedPendingCreate(id)) {
                                          deletes.add(prevAtPath);
                                          changesById.set(id, change);
                                      }
                                  }
                              } else {
                                  if (generateId) {
                                      ensureId(itemValue, fieldId, generateId, getChildNode(node, itemKey + ''));
                                  }
                                  const previous = setAtPath(
                                      clone(itemValue),
                                      path.slice(1),
                                      pathTypes.slice(1),
                                      prevAtPath,
                                  );

                                  itemsChanged = [[getUpdateValue(itemValue, previous), previous, itemValue]];
                              }
                          }
                          itemsChanged?.forEach(([item, prev, fullValue]) => {
                              const id = item[fieldId];
                              const isFailedCreateRetry = isFailedCreateReadyToRetry(id);
                              const isCreate =
                                  isFailedCreateRetry ||
                                  (!pendingCreates.has(id) &&
                                      (fieldCreatedAt
                                          ? !item[fieldCreatedAt!] && !prev?.[fieldCreatedAt!]
                                          : fieldUpdatedAt
                                            ? !item[fieldUpdatedAt] && !prev?.[fieldCreatedAt!]
                                            : isNullOrUndefined(prev)));
                              if (isCreate) {
                                  if (!id) {
                                      console.error('[legend-state]: added item without an id');
                                  }
                                  if (createFn) {
                                      addCreate(id, isFailedCreateRetry ? fullValue : item, change);
                                  } else {
                                      console.warn('[legend-state] missing create function');
                                  }
                              } else {
                                  if (updateFn) {
                                      const id = item[fieldId];
                                      changesById.set(id, change);
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

                  const saveResult = async (
                      itemKey: ItemKey,
                      input: TRemote,
                      data: CrudResult<TRemote>,
                      isCreate: boolean,
                      change: ChangeWithPathStr,
                  ) => {
                      if (data) {
                          let saved: Partial<TLocal> = (
                              transform?.load ? await transform.load(data as any, 'set') : data
                          ) as any;

                          const isChild = itemKey !== 'undefined' && asType !== 'value';
                          const currentPeeked = getNodeValue(node);

                          // If this is a child then get the value from the parent
                          // If it's an array then find the value in the array
                          // Otherwise get the value from the object
                          const currentValue = isChild
                              ? ((asType === 'array' && isArray(currentPeeked)
                                    ? currentPeeked.find((v) => v[fieldId] === itemKey)
                                    : undefined) ??
                                (asType === 'Map' ? currentPeeked.get(itemKey) : currentPeeked[itemKey]))
                              : currentPeeked;

                          // If this value has been deleted locally before this finished saving then ignore the result
                          if (saved && !isNullOrUndefined(currentValue)) {
                              if (onSaved) {
                                  // First call onSaved the saved value before removing keys
                                  const ret = onSaved({
                                      saved: saved as TLocal,
                                      input,
                                      currentValue,
                                      isCreate,
                                      props,
                                  });

                                  if (ret) {
                                      saved = ret;
                                  }
                              }

                              // Remove keys from saved that have been modified locally since saving
                              saved = clone(saved) as TLocal;
                              Object.keys(saved).forEach((key) => {
                                  const i = (input as any)[key];
                                  const c = currentValue[key];
                                  if (
                                      // value is already the new value, can ignore
                                      (saved as any)[key] === c ||
                                      // user has changed local value
                                      (key !== fieldId && i !== undefined && i !== c)
                                  ) {
                                      delete (saved as any)[key];
                                  }
                              });

                              let value: any;
                              if (asType === 'array') {
                                  const index = (currentPeeked as any[]).findIndex(
                                      (cur: any) => cur[fieldId] === itemKey,
                                  );
                                  if (index < 0) {
                                      console.warn('[legend-state] Item saved that does not exist in array', saved);
                                  } else {
                                      value = { [index < 0 ? 0 : index]: saved };
                                  }
                              } else {
                                  value = itemKey !== 'undefined' && asType !== 'value' ? { [itemKey]: saved } : saved;
                              }

                              if (value !== undefined) {
                                  update({
                                      value,
                                      mode: 'merge',
                                      changes: [change],
                                  });
                              }
                          }
                      }
                  };

                  return Promise.all([
                      // Handle creates
                      ...Array.from(creates).map(async ([itemKey, itemValue]) => {
                          if (waitForSetParam) {
                              await waitForSet(waitForSetParam as any, changes, itemValue, { type: 'create' });
                          }
                          const createObj = (await transformOut(itemValue as any, transform?.save)) as TRemote;
                          const pendingCreate = pendingCreates.get(itemKey) || { hasFailed: false };
                          pendingCreates.set(itemKey, pendingCreate);
                          const refreshCreateValue = async () => {
                              const currentPendingCreate = pendingCreates.get(itemKey);
                              if (!currentPendingCreate) {
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
                              const nextCreateObj = (await transformOut(
                                  clone(currentValue),
                                  transform?.save,
                              )) as TRemote;
                              return { value: nextCreateObj, fullValue: nextCreateObj };
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
                          const fullValueTransformed = (await transformOut(
                              fullValue as TLocal,
                              transform?.save,
                          )) as TRemote;
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
                              );
                          }
                      }),

                      // Handle deletes
                      ...Array.from(deletes)
                          .filter((val) => val !== (symbolDelete as any))
                          .map(async (valuePrevious) => {
                              if (waitForSetParam) {
                                  await waitForSet(waitForSetParam as any, changes, valuePrevious, { type: 'delete' });
                              }
                              const itemKey = (valuePrevious as any)[fieldId];

                              if (!itemKey) {
                                  console.error('[legend-state]: deleting item without an id');
                                  return;
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
                  ]);
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
        ...(rest as any),
    });
}
