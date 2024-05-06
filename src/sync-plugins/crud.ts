import { internal, isArray, isNullOrUndefined, isNumber, isObject, isString } from '@legendapp/state';
import {
    synced,
    diffObjects,
    SyncTransform,
    SyncTransformMethod,
    SyncedGetParams,
    SyncedOptions,
    SyncedSetParams,
} from '@legendapp/state/sync';

const { clone } = internal;

export type CrudAsOption = 'Map' | 'object' | 'first';

export type CrudResult<T> = T;

export interface SyncedCrudPropsSingle<TRemote, TLocal> {
    get?: (params: SyncedGetParams) => Promise<CrudResult<TRemote | null>> | CrudResult<TRemote | null>;
    initial?: InitialValue<TLocal, 'first'>;
    as?: never | 'first';
}
export interface SyncedCrudPropsMany<TRemote, TLocal, TAsOption extends CrudAsOption> {
    list?: (params: SyncedGetParams) => Promise<CrudResult<TRemote[] | null>> | CrudResult<TRemote[] | null>;
    as?: TAsOption;
    initial?: InitialValue<TLocal, TAsOption>;
}
export interface SyncedCrudPropsBase<TRemote extends { id: string | number }, TLocal = TRemote>
    extends Omit<SyncedOptions<TLocal>, 'get' | 'set' | 'transform' | 'initial'> {
    create?(input: TRemote, params: SyncedSetParams<TRemote>): Promise<CrudResult<TRemote> | null | undefined>;
    update?(
        input: Partial<TRemote>,
        params: SyncedSetParams<TRemote>,
    ): Promise<CrudResult<Partial<TRemote> | null | undefined>>;
    delete?(input: { id: TRemote['id'] }, params: SyncedSetParams<TRemote>): Promise<CrudResult<any>>;
    onSaved?(saved: TLocal, input: TRemote, isCreate: boolean): Partial<TLocal> | void;
    transform?: SyncTransform<TLocal, TRemote>;
    fieldUpdatedAt?: string;
    fieldCreatedAt?: string;
    updatePartial?: boolean;
    changesSince?: 'all' | 'last-sync';
    generateId?: () => string | number;
}

type InitialValue<T, TAsOption extends CrudAsOption> = TAsOption extends 'Map'
    ? Map<string, T>
    : TAsOption extends 'object'
    ? Record<string, T>
    : TAsOption extends 'first'
    ? T
    : T[];

export type SyncedCrudReturnType<TLocal, TAsOption extends CrudAsOption> = TAsOption extends 'Map'
    ? Map<string, TLocal>
    : TAsOption extends 'object'
    ? Record<string, TLocal>
    : TAsOption extends 'first'
    ? TLocal
    : TLocal[];

let _asOption: CrudAsOption;

function transformOut<T1, T2>(data: T1, transform: undefined | ((value: T1) => T2)) {
    return transform ? transform(clone(data)) : data;
}

// TODO
export function createTransform<T extends Record<string, any>, T2 extends Record<string, any>>(
    ...keys: (keyof T | { from: keyof T; to: keyof T2 })[]
): SyncTransform<T2, T> {
    return {
        load: (value: T) => {
            (keys as string[]).forEach((key) => {
                const keyRemote = isObject(key) ? key.from : key;
                const keyLocal = isObject(key) ? key.to : key;
                const v = value[keyRemote];
                if (!isNullOrUndefined(v)) {
                    value[keyLocal as keyof T] = isString(v) ? JSON.parse(v as string) : v;
                }
                if (keyLocal !== keyRemote) {
                    delete value[keyRemote];
                }
            });
            return value as unknown as T2;
        },
        save: (value: T2) => {
            (keys as string[]).forEach((key: string) => {
                const keyRemote = isObject(key) ? key.from : key;
                const keyLocal = isObject(key) ? key.to : key;
                let v = (value as any)[keyLocal];
                if (!isNullOrUndefined(v)) {
                    if (isArray(v)) {
                        v = v.filter((val) => !isNullOrUndefined(val));
                    }
                    value[keyRemote as keyof T2] =
                        isNumber(v) || isObject(v) || isArray(v) ? (JSON.stringify(v) as any) : v;
                }
                if (keyLocal !== keyRemote) {
                    delete value[keyLocal];
                }
            });
            return value as unknown as T;
        },
    };
}

// TODO
export function combineTransforms<T, T2>(
    transform1: SyncTransform<T2, T>,
    ...transforms: Partial<SyncTransform<T2, T>>[]
): SyncTransform<T2, T> {
    return {
        load: (value: T, method: SyncTransformMethod) => {
            let inValue = transform1.load?.(value, method) as any;
            transforms.forEach((transform) => {
                if (transform.load) {
                    inValue = transform.load(inValue, method);
                }
            });
            return inValue;
        },
        save: (value: T2) => {
            let outValue = value as any;
            transforms.forEach((transform) => {
                if (transform.save) {
                    outValue = transform.save(outValue);
                }
            });
            return transform1.save?.(outValue) ?? outValue;
        },
    };
}

function ensureId(obj: { id: string | number }, generateId: () => string | number) {
    if (!obj.id) {
        obj.id = generateId();
    }
    return obj.id;
}

export function syncedCrud<TRemote extends { id: string | number }, TLocal = TRemote>(
    props: SyncedCrudPropsBase<TRemote, TLocal> & SyncedCrudPropsSingle<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, 'first'>;
export function syncedCrud<
    TRemote extends { id: string | number },
    TLocal = TRemote,
    TAsOption extends CrudAsOption = 'object',
>(
    props: SyncedCrudPropsBase<TRemote, TLocal> & SyncedCrudPropsMany<TRemote, TLocal, TAsOption>,
): SyncedCrudReturnType<TLocal, Exclude<TAsOption, 'first'>>;
export function syncedCrud<
    TRemote extends { id: string | number },
    TLocal = TRemote,
    TAsOption extends CrudAsOption = 'object',
>(
    props: SyncedCrudPropsBase<TRemote, TLocal> &
        (SyncedCrudPropsSingle<TRemote, TLocal> & SyncedCrudPropsMany<TRemote, TLocal, TAsOption>),
): SyncedCrudReturnType<TLocal, TAsOption> {
    const {
        get: getFn,
        list: listFn,
        create: createFn,
        update: updateFn,
        delete: deleteFn,
        transform,
        fieldCreatedAt,
        fieldUpdatedAt,
        updatePartial,
        onSaved,
        mode: modeParam,
        changesSince,
        generateId,
        ...rest
    } = props;

    let asType = props.as as TAsOption;

    if (!asType) {
        asType = (getFn ? 'first' : _asOption || 'object') as CrudAsOption as TAsOption;
    }

    const asMap = asType === 'Map';

    const get: undefined | ((params: SyncedGetParams) => Promise<TLocal>) =
        getFn || listFn
            ? async (getParams: SyncedGetParams) => {
                  const { updateLastSync, lastSync } = getParams;
                  if (listFn) {
                      if (changesSince === 'last-sync' && lastSync) {
                          getParams.mode = modeParam || (asType === 'first' ? 'set' : 'assign');
                      }

                      const data = (await listFn(getParams)) || [];
                      let newLastSync = 0;
                      for (let i = 0; i < data.length; i++) {
                          const updated =
                              (data[i] as any)[fieldUpdatedAt as any] || (data[i] as any)[fieldCreatedAt as any];
                          if (updated) {
                              newLastSync = Math.max(newLastSync, +new Date(updated));
                          }
                      }
                      if (newLastSync && newLastSync !== lastSync) {
                          updateLastSync(newLastSync);
                      }
                      let transformed = data as unknown as TLocal[];
                      if (transform?.load) {
                          transformed = await Promise.all(data.map((value) => transform.load!(value, 'get')));
                      }
                      if (asType === 'first') {
                          return transformed.length > 0 ? transformed[0] : null;
                      } else {
                          const out: Record<string, any> = asMap ? new Map() : {};
                          transformed.forEach((result: any) => {
                              const value = result.__deleted ? internal.symbolDelete : result;
                              asMap ? (out as Map<any, any>).set(result.id, value) : (out[result.id] = value);
                          });
                          return out;
                      }
                  } else if (getFn) {
                      const data = await getFn(getParams);

                      let transformed = data as unknown as TLocal;
                      if (data) {
                          const newLastSync =
                              (data as any)[fieldUpdatedAt as any] || (data as any)[fieldCreatedAt as any];
                          if (newLastSync && newLastSync !== lastSync) {
                              updateLastSync(newLastSync);
                          }
                          if (transform?.load) {
                              transformed = await transform.load(data, 'get');
                          }
                      }

                      return transformed as any;
                  }
              }
            : undefined;

    const set =
        createFn || updateFn || deleteFn
            ? async (params: SyncedSetParams<any> & { retryAsCreate?: boolean }) => {
                  const { value, changes, update, retryAsCreate, valuePrevious } = params;
                  const creates = new Map<string, TLocal>();
                  const updates = new Map<string, object>();
                  const deletes = new Set<string>();

                  changes.forEach(({ path, prevAtPath, valueAtPath }) => {
                      if (asType === 'first') {
                          if (value) {
                              let id = value?.id;
                              const isCreate = fieldCreatedAt ? !value[fieldCreatedAt!] : !prevAtPath;
                              if (!id && generateId) {
                                  id = ensureId(value, generateId);
                              }
                              if (id) {
                                  if (isCreate || retryAsCreate) {
                                      creates.set(id, value);
                                  } else if (path.length === 0) {
                                      if (valueAtPath) {
                                          updates.set(id, valueAtPath);
                                      } else if (prevAtPath) {
                                          deletes.add(prevAtPath?.id);
                                      }
                                  } else {
                                      const key = path[0];
                                      updates.set(id, Object.assign(updates.get(id) || { id }, { [key]: value[key] }));
                                  }
                              } else {
                                  console.error('[legend-state]: added item without an id');
                              }
                          } else if (path.length === 0) {
                              const id = prevAtPath?.id;
                              if (id) {
                                  deletes.add(id);
                              }
                          }
                      } else {
                          let itemsChanged: [string, any][] | undefined = undefined;
                          let isCreateGuess: boolean;
                          if (path.length === 0) {
                              isCreateGuess =
                                  !(fieldCreatedAt || fieldUpdatedAt) &&
                                  !(
                                      (asMap
                                          ? Array.from((valueAtPath as Map<any, any>).values())
                                          : isArray(valueAtPath)
                                          ? valueAtPath
                                          : Object.values(valueAtPath)
                                      )?.length > 0
                                  );
                              itemsChanged = asMap
                                  ? Array.from((valueAtPath as Map<any, any>).entries())
                                  : isArray(valueAtPath)
                                  ? valueAtPath
                                  : Object.entries(valueAtPath);
                          } else {
                              const itemKey = path[0];
                              const itemValue = asMap ? value.get(itemKey) : value[itemKey];
                              isCreateGuess = !(fieldCreatedAt || fieldUpdatedAt) && path.length === 1 && !prevAtPath;
                              if (!itemValue) {
                                  if (path.length === 1 && prevAtPath) {
                                      if (deleteFn) {
                                          deletes.add(itemKey);
                                      } else {
                                          console.log('[legend-state] missing delete function');
                                      }
                                  }
                              } else {
                                  itemsChanged = [[itemKey, itemValue]];
                              }
                          }
                          itemsChanged?.forEach(([itemKey, item]) => {
                              if (isNullOrUndefined(item)) {
                                  deletes.add(itemKey);
                              } else {
                                  const isCreate = fieldCreatedAt
                                      ? !item[fieldCreatedAt!]
                                      : fieldUpdatedAt
                                      ? !item[fieldUpdatedAt]
                                      : isCreateGuess;
                                  if (isCreate) {
                                      if (generateId) {
                                          ensureId(item, generateId);
                                      }
                                      if (!item.id) {
                                          console.error('[legend-state]: added item without an id');
                                      }
                                      if (createFn) {
                                          creates.set(item.id, item);
                                      } else {
                                          console.log('[legend-state] missing create function');
                                      }
                                  } else {
                                      if (updateFn) {
                                          updates.set(item.id, item);
                                      } else {
                                          console.log('[legend-state] missing update function');
                                      }
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
                  ) => {
                      if (data && onSaved) {
                          const dataLoaded: TLocal = (
                              transform?.load ? transform.load(data as any, 'set') : data
                          ) as any;

                          const savedOut = onSaved(dataLoaded, input, isCreate);

                          if (savedOut) {
                              const createdAt = fieldCreatedAt ? savedOut[fieldCreatedAt as keyof TLocal] : undefined;
                              const updatedAt = fieldUpdatedAt ? savedOut[fieldUpdatedAt as keyof TLocal] : undefined;

                              const value =
                                  itemKey !== 'undefined' && asType !== 'first' ? { [itemKey]: savedOut } : savedOut;
                              update({
                                  value,
                                  lastSync:
                                      updatedAt || createdAt ? +new Date(updatedAt || (createdAt as any)) : undefined,
                                  mode: 'merge',
                              });
                          }
                      }
                  };

                  return Promise.all([
                      ...Array.from(creates).map(([itemKey, itemValue]) => {
                          const createObj = transformOut(itemValue, transform?.save) as TRemote;
                          return createFn!(createObj, params).then((result) =>
                              saveResult(itemKey, createObj, result as any, true),
                          );
                      }),
                      ...Array.from(updates).map(([itemKey, itemValue]) => {
                          const toSave = updatePartial
                              ? Object.assign(
                                    diffObjects(asType === 'first' ? valuePrevious : valuePrevious[itemKey], itemValue),
                                    { id: (itemValue as any).id },
                                )
                              : itemValue;
                          const changed = transformOut(toSave as TLocal, transform?.save) as TRemote;

                          if (Object.keys(changed).length > 0) {
                              return updateFn!(changed, params).then((result) =>
                                  saveResult(itemKey, changed, result as any, false),
                              );
                          }
                      }),
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      ...Array.from(deletes).map((itemKey) => deleteFn!({ id: itemKey }, params)),
                  ]);
              }
            : undefined;

    return synced<any>({
        set,
        get,
        mode: modeParam,
        ...rest,
    });
}
