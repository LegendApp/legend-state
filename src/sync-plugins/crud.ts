import {
    Change,
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

const { clone, getKeys } = internal;
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

export interface WaitForSetCrudFnParams<T> extends WaitForSetFnParams<T> {
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

function ensureId(obj: any, fieldId: string, generateId: () => string | number) {
    if (!obj[fieldId]) {
        obj[fieldId] = generateId();
    }
    return obj[fieldId];
}

function computeLastSync(data: any[], fieldUpdatedAt: string | undefined, fieldCreatedAt: string | undefined) {
    let newLastSync = 0;
    for (let i = 0; i < data.length; i++) {
        const updated =
            (fieldUpdatedAt ? (data[i] as any)[fieldUpdatedAt as any] : 0) ||
            (fieldCreatedAt ? (data[i] as any)[fieldCreatedAt as any] : 0);
        if (updated) {
            newLastSync = Math.max(newLastSync, +new Date(updated));
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
            record[key] = v;
        }
    }
    return record;
}

function retrySet(
    params: SyncedSetParams<any>,
    retry: RetryOptions | undefined,
    action: 'create' | 'update' | 'delete',
    itemKey: string,
    itemValue: any,
    change: Change,
    queuedRetries: {
        create: Map<string, any>;
        update: Map<string, any>;
        delete: Map<string, any>;
    },
    actionFn: (value: any, params: SyncedSetParams<any>) => Promise<any>,
    saveResult: (itemKey: string, itemValue: any, result: any, isCreate: boolean, change: Change) => void,
) {
    // If delete then remove from create/update, and vice versa
    if (action === 'delete') {
        if (queuedRetries.create.has(itemKey)) {
            queuedRetries.create.delete(itemKey);
        }
        if (queuedRetries.update.has(itemKey)) {
            queuedRetries.update.delete(itemKey);
        }
    } else {
        if (queuedRetries.delete.has(itemKey)) {
            queuedRetries.delete.delete(itemKey);
        }
    }

    // Get the currently queued value and assigned the new changes onto it
    const queuedRetry = queuedRetries[action]!.get(itemKey);
    if (queuedRetry) {
        itemValue = Object.assign(queuedRetry, itemValue);
    }

    queuedRetries[action].set(itemKey, itemValue);

    const paramsWithChanges: SyncedSetParams<any> = { ...params, changes: [change] };

    return runWithRetry(paramsWithChanges, retry, 'create_' + itemKey, () =>
        actionFn!(itemValue, paramsWithChanges).then((result) => {
            queuedRetries[action]!.delete(itemKey);
            return saveResult(itemKey, itemValue, result as any, true, change);
        }),
    );
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
    const pendingCreates = new Set<string>();
    const queuedRetries = {
        create: new Map<string, any>(),
        update: new Map<string, any>(),
        delete: new Map<string, any>(),
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
                    (out as Map<string, any>).set(value[fieldId], result);
                } else {
                    (out as Record<string, any>)[value[fieldId]] = result;
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
                  const creates = new Map<string, TLocal>();
                  const updates = new Map<string, object>();
                  const updateFullValues = new Map<string, object>();
                  const deletes = new Set<TRemote>();
                  const changesById = new Map<string, Change>();

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

                  changes.forEach((change) => {
                      const { path, prevAtPath, valueAtPath, pathTypes } = change;
                      if (asType === 'value') {
                          if (value) {
                              let id = value?.[fieldId];
                              let isCreate = fieldCreatedAt ? !value[fieldCreatedAt!] : !prevAtPath;
                              if (isNullOrUndefined(id) && generateId) {
                                  id = ensureId(value, fieldId, generateId);
                              }
                              if (!isNullOrUndefined(id)) {
                                  changesById.set(id, change);
                                  if (pendingCreates.has(id)) {
                                      isCreate = false;
                                  }
                                  if (isCreate || retryAsCreate) {
                                      if (createFn) {
                                          creates.set(id, value);
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
                              deletes.add(prevAtPath);
                              changesById.set(prevAtPath[fieldId], change);
                          }
                      } else {
                          // value, previous, fullValue
                          let itemsChanged: [any, any, any][] | undefined = [];
                          if (path.length === 0) {
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
                                      deletes.add(prevAsObject[key]);
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
                                      deletes.add(prevAtPath);
                                      changesById.set(prevAtPath[fieldId], change);
                                  }
                              } else {
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
                              const isCreate =
                                  !pendingCreates.has(item[fieldId]) &&
                                  (fieldCreatedAt
                                      ? !item[fieldCreatedAt!] && !prev?.[fieldCreatedAt!]
                                      : fieldUpdatedAt
                                        ? !item[fieldUpdatedAt] && !prev?.[fieldCreatedAt!]
                                        : isNullOrUndefined(prev));
                              if (isCreate) {
                                  if (generateId) {
                                      ensureId(item, fieldId, generateId);
                                  }
                                  if (!item[fieldId]) {
                                      console.error('[legend-state]: added item without an id');
                                  }
                                  if (createFn) {
                                      const id = item[fieldId];
                                      changesById.set(id, change);
                                      pendingCreates.add(id);
                                      creates.set(id, item);
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
                      itemKey: string,
                      input: TRemote,
                      data: CrudResult<TRemote>,
                      isCreate: boolean,
                      change: Change,
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
                          return retrySet(
                              params,
                              retry,
                              'create',
                              itemKey,
                              createObj,
                              changesById.get(itemKey)!,
                              queuedRetries,
                              createFn!,
                              saveResult,
                          ).then(() => {
                              pendingCreates.delete(itemKey);
                          });
                      }),

                      // Handle updates
                      ...Array.from(updates).map(async ([itemKey, itemValue]) => {
                          if (waitForSetParam) {
                              // waitForSet should receive the full value
                              const fullValue = updateFullValues.get(itemKey);
                              await waitForSet(waitForSetParam as any, changes, fullValue, { type: 'update' });
                          }
                          const changed = (await transformOut(itemValue as TLocal, transform?.save)) as TRemote;
                          if (Object.keys(changed).length > 0) {
                              return retrySet(
                                  params,
                                  retry,
                                  'update',
                                  itemKey,
                                  changed,
                                  changesById.get(itemKey)!,
                                  queuedRetries,
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
                                      deleteFn!,
                                      saveResult,
                                  );
                              }

                              if (fieldDeleted && updateFn) {
                                  return retrySet(
                                      params,
                                      retry,
                                      'delete',
                                      itemKey,
                                      { [fieldId]: itemKey, [fieldDeleted]: true } as any,
                                      changesById.get(itemKey)!,
                                      queuedRetries,
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
