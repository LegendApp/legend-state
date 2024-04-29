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

export type CrudAsOption = 'Map' | 'object' | 'first' | 'array';

export type CrudResult<T> = T;

export interface SyncedCrudPropsSingle<TGet> {
    get?: (params: SyncedGetParams) => Promise<CrudResult<TGet | null>> | CrudResult<TGet | null>;
    initial?: TGet;
}
export interface SyncedCrudPropsMany<TGet, TOption extends CrudAsOption> {
    list?: (params: SyncedGetParams) => Promise<CrudResult<TGet[]>> | CrudResult<TGet[]>;
    as?: TOption;
    initial?: InitialValue<TGet, TOption>;
}
export interface SyncedCrudPropsBase<TGet extends { id: string }, TSet = TGet, TOut = TGet>
    extends Omit<SyncedOptions<TGet>, 'get' | 'set' | 'subscribe' | 'transform' | 'initial'> {
    generateId?: () => string;
    create?: (input: TSet, params: SyncedSetParams<TSet>) => Promise<CrudResult<TGet>>;
    update?: (input: Partial<TGet>, params: SyncedSetParams<TSet>) => Promise<CrudResult<Partial<TGet>>>;
    delete?: (input: TGet, params: SyncedSetParams<TSet>) => Promise<CrudResult<any>>;
    onSaved?: (saved: Partial<TGet>, input: Partial<TGet>, isCreate: boolean) => Partial<TGet>;
    transform?: SyncTransform<TOut, TGet>;
    fieldUpdatedAt?: string;
    updatePartial?: boolean;
}

type OutputType<TGet, TSet> = [TSet] extends [unknown] ? TGet : Partial<TGet> & TSet;

type InitialValue<T, TOption extends CrudAsOption> = TOption extends 'Map'
    ? Map<string, T>
    : TOption extends 'object'
    ? Record<string, T>
    : TOption extends 'first'
    ? T
    : T[];

export type SyncedCrudReturnType<TGet, TSet, TOption extends CrudAsOption> = Promise<
    TOption extends 'Map'
        ? Map<string, OutputType<TGet, TSet>>
        : TOption extends 'object'
        ? Record<string, OutputType<TGet, TSet>>
        : TOption extends 'first'
        ? OutputType<TGet, TSet>
        : TGet[]
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

export function syncedCrud<TGet extends { id: string }, TSet = TGet, TOut = TGet>(
    props: SyncedCrudPropsBase<TGet, TSet, TOut> & SyncedCrudPropsSingle<TGet>,
): SyncedCrudReturnType<TOut, TSet, 'first'>;
export function syncedCrud<
    TGet extends { id: string },
    TSet = TGet,
    TOut = TGet,
    TOption extends CrudAsOption = 'object',
>(
    props: SyncedCrudPropsBase<TGet, TSet, TOut> & SyncedCrudPropsMany<TGet, TOption>,
): SyncedCrudReturnType<TOut, TSet, Exclude<TOption, 'first'>>;
export function syncedCrud<
    TGet extends { id: string },
    TSet = TGet,
    TOut = TGet,
    TOption extends CrudAsOption = 'object',
>(
    props: SyncedCrudPropsBase<TGet, TSet, TOut> & (SyncedCrudPropsSingle<TGet> & SyncedCrudPropsMany<TGet, TOption>),
): SyncedCrudReturnType<TOut, TSet, TOption> {
    const {
        get: getFn,
        list: listFn,
        create: createFn,
        update: updateFn,
        delete: deleteFn,
        transform,
        fieldUpdatedAt,
        generateId,
        updatePartial,
        onSaved,
        ...rest
    } = props;

    let asType = props.as;

    if (!asType) {
        asType = (getFn ? 'first' : _asOption || 'array') as CrudAsOption as TOption;
    }

    const asMap = asType === 'Map';

    const ensureId = (obj: { id: string }) => obj.id || (obj.id = generateId!());

    const get: undefined | ((params: SyncedGetParams) => Promise<TOut>) =
        getFn || listFn
            ? async (getParams: SyncedGetParams) => {
                  const { updateLastSync, lastSync } = getParams;
                  if (listFn) {
                      if (lastSync) {
                          getParams.mode = 'assign';
                      }

                      let data = await listFn(getParams);
                      let newLastSync = 0;
                      for (let i = 0; i < data.length; i++) {
                          const updated = (data[i] as any)[fieldUpdatedAt as any];
                          if (updated) {
                              newLastSync = Math.max(newLastSync, +new Date(updated));
                          }
                      }
                      if (newLastSync && newLastSync !== lastSync) {
                          updateLastSync(newLastSync);
                      }
                      if (transform?.load) {
                          data = data.map(transform.load) as any;
                      }
                      if (asType === 'first') {
                          return data.length > 0 ? data[0] : lastSync ? {} : null;
                      } else if (asType === 'array') {
                          return data;
                      } else {
                          const out: Record<string, any> = asMap ? new Map() : {};
                          data.forEach((result: any) => {
                              const value = result.__deleted ? internal.symbolDelete : result;
                              asMap ? (out as Map<any, any>).set(result.id, value) : (out[result.id] = value);
                          });
                          return out;
                      }
                  } else if (getFn) {
                      let data = await getFn(getParams);

                      if (data) {
                          const newLastSync = (data as any)[fieldUpdatedAt as any];
                          if (newLastSync && newLastSync !== lastSync) {
                              updateLastSync(newLastSync);
                          }
                          if (transform?.load) {
                              data = transform.load(data as any) as any;
                          }
                      }

                      return data as any;
                  }
              }
            : undefined;

    const set =
        createFn || updateFn || deleteFn
            ? async (params: SyncedSetParams<any> & { retryAsCreate?: boolean }) => {
                  const { value, changes, update, retryAsCreate, valuePrevious } = params;
                  const creates = new Map<string, TSet>();
                  const updates = new Map<string, object>();
                  const deletes = new Map<string, object>();

                  changes.forEach(({ path, prevAtPath, valueAtPath }) => {
                      if (asType === 'first') {
                          if (value) {
                              let id = value?.id;
                              const isCreate = fieldUpdatedAt ? !value[fieldUpdatedAt!] : !prevAtPath;
                              if (isCreate || retryAsCreate) {
                                  id = ensureId(value);
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
                                  !fieldUpdatedAt &&
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
                              isCreateGuess = !fieldUpdatedAt && path.length === 1 && !prevAtPath;
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
                              ensureId(item);
                              const isCreate = fieldUpdatedAt ? !item[fieldUpdatedAt!] : isCreateGuess;
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
                      data: CrudResult<TSet>,
                      isCreate: boolean,
                  ) => {
                      if (data && onSaved) {
                          const dataLoaded: TGet = (transform?.load ? transform.load(data as any) : data) as any;

                          const savedOut = onSaved(dataLoaded, input, isCreate);

                          const updatedAt = fieldUpdatedAt ? savedOut[fieldUpdatedAt as keyof TGet] : undefined;

                          const value =
                              itemKey !== 'undefined' && asType !== 'first' ? { [itemKey]: savedOut } : savedOut;
                          update({
                              value,
                              lastSync: updatedAt ? +new Date(updatedAt as any) : undefined,
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
                          const changed = transformOut(toSave as TGet, transform?.save as any);

                          if (Object.keys(changed).length > 0) {
                              return updateFn!(changed, params).then((result) =>
                                  saveResult(itemKey, changed, result as any, false),
                              );
                          }
                      }),
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      ...Array.from(deletes).map(([_, itemValue]) => deleteFn!(itemValue as TGet, params)),
                  ]);
              }
            : undefined;

    return synced<any>({
        set,
        get,
        ...rest,
    });
}
