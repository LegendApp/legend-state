import {
    SyncTransform,
    SyncedGetParams,
    SyncedOptions,
    SyncedSetParams,
    internal,
    isArray,
    isNullOrUndefined,
    isNumber,
    isObject,
    isString,
} from '@legendapp/state';
import { synced, diffObjects } from '@legendapp/state/sync';

const { clone } = internal;

export type CrudAsOption = 'Map' | 'object' | 'first';

export type CrudResult<T> = T;

export interface SyncedCrudPropsSingle<TRemote, TLocal> {
    get?: (params: SyncedGetParams) => Promise<CrudResult<TRemote | null>> | CrudResult<TRemote | null>;
    initial?: TLocal;
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
    delete?(input: TRemote, params: SyncedSetParams<TRemote>): Promise<CrudResult<any>>;
    onSaved?(saved: Partial<TLocal>, input: Partial<TLocal>, isCreate: boolean): Partial<TLocal>;
    transform?: SyncTransform<TLocal, TRemote>;
    fieldUpdatedAt?: string;
    fieldCreatedAt?: string;
    updatePartial?: boolean;
    changesSince?: 'all' | 'last-sync';
}

type InitialValue<T, TAsOption extends CrudAsOption> = TAsOption extends 'Map'
    ? Map<string, T>
    : TAsOption extends 'object'
    ? Record<string, T>
    : TAsOption extends 'first'
    ? T
    : T[];

export type SyncedCrudReturnType<TLocal, TAsOption extends CrudAsOption> = Promise<
    TAsOption extends 'Map'
        ? Map<string, TLocal>
        : TAsOption extends 'object'
        ? Record<string, TLocal>
        : TAsOption extends 'first'
        ? TLocal
        : TLocal[]
> & {};

let _asOption: CrudAsOption;

function transformOut<T>(data: T, transform: undefined | ((value: T) => T)) {
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
        load: (value: T) => {
            let inValue = transform1.load?.(value) as any;
            transforms.forEach((transform) => {
                if (transform.load) {
                    inValue = transform.load(inValue);
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
                          transformed = await Promise.all(data.map(transform.load));
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
                              transformed = await transform.load(data);
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
                  const creates = new Map<string, TRemote>();
                  const updates = new Map<string, object>();
                  const deletes = new Map<string, object>();

                  changes.forEach(({ path, prevAtPath, valueAtPath }) => {
                      if (asType === 'first') {
                          if (value) {
                              const id = value?.id;
                              if (id) {
                                  const isCreate = fieldCreatedAt ? !value[fieldCreatedAt!] : !prevAtPath;
                                  if (isCreate || retryAsCreate) {
                                      creates.set(id, value);
                                  } else if (path.length === 0) {
                                      if (valueAtPath) {
                                          updates.set(id, valueAtPath);
                                      } else if (prevAtPath) {
                                          deletes.set(prevAtPath?.id, prevAtPath);
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
                                  deletes.set(id, prevAtPath);
                              }
                          }
                      } else {
                          let itemsChanged: any[] | undefined = undefined;
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
                                  ? Array.from((valueAtPath as Map<any, any>).values())
                                  : isArray(valueAtPath)
                                  ? valueAtPath
                                  : Object.values(valueAtPath);
                          } else {
                              const itemKey = path[0];
                              const itemValue = asMap ? value.get(itemKey) : value[itemKey];
                              isCreateGuess = !(fieldCreatedAt || fieldUpdatedAt) && path.length === 1 && !prevAtPath;
                              if (!itemValue) {
                                  if (path.length === 1 && prevAtPath) {
                                      if (deleteFn) {
                                          deletes.set(itemKey, prevAtPath);
                                      } else {
                                          console.log('[legend-state] missing delete function');
                                      }
                                  }
                              } else {
                                  itemsChanged = [itemValue];
                              }
                          }
                          itemsChanged?.forEach((item) => {
                              const isCreate = fieldCreatedAt
                                  ? !item[fieldCreatedAt!]
                                  : fieldUpdatedAt
                                  ? !item[fieldUpdatedAt]
                                  : isCreateGuess;
                              if (isCreate) {
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
                          });
                      }
                  });

                  const saveResult = async (
                      itemKey: string,
                      input: object,
                      data: CrudResult<TRemote>,
                      isCreate: boolean,
                  ) => {
                      if (data && onSaved) {
                          const dataLoaded: TLocal = (transform?.load ? transform.load(data as any) : data) as any;

                          const savedOut = onSaved(dataLoaded, input, isCreate);

                          const createdAt = fieldCreatedAt ? savedOut[fieldCreatedAt as keyof TLocal] : undefined;
                          const updatedAt = fieldUpdatedAt ? savedOut[fieldUpdatedAt as keyof TLocal] : undefined;

                          const value =
                              itemKey !== 'undefined' && asType !== 'first' ? { [itemKey]: savedOut } : savedOut;
                          update({
                              value,
                              lastSync: updatedAt || createdAt ? +new Date(updatedAt || (createdAt as any)) : undefined,
                              mode: 'merge',
                          });
                      }
                  };

                  return Promise.all([
                      ...Array.from(creates).map(([itemKey, itemValue]) => {
                          const createObj = transformOut(itemValue, transform?.save as any);
                          return createFn!(createObj, params).then((result) =>
                              saveResult(itemKey, createObj as object, result as any, true),
                          );
                      }),
                      ...Array.from(updates).map(([itemKey, itemValue]) => {
                          const toSave = updatePartial
                              ? diffObjects(asType === 'first' ? valuePrevious : valuePrevious[itemKey], itemValue)
                              : itemValue;
                          const changed = transformOut(toSave as TRemote, transform?.save as any);

                          if (Object.keys(changed).length > 0) {
                              return updateFn!(changed, params).then((result) =>
                                  saveResult(itemKey, changed, result as any, false),
                              );
                          }
                      }),
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      ...Array.from(deletes).map(([_, itemValue]) => deleteFn!(itemValue as TRemote, params)),
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
