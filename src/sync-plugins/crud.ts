import { getNodeValue, internal, isArray, isNullOrUndefined } from '@legendapp/state';
import { SyncedGetParams, SyncedOptions, SyncedSetParams, diffObjects, synced } from '@legendapp/state/sync';

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
export interface SyncedCrudOnSavedParams<TRemote extends { id: string | number }, TLocal> {
    saved: TLocal;
    input: TRemote;
    currentValue: TLocal;
    isCreate: boolean;
    props: SyncedCrudPropsBase<TRemote, TLocal>;
}
export interface SyncedCrudPropsBase<TRemote extends { id: string | number }, TLocal = TRemote>
    extends Omit<SyncedOptions<TRemote, TLocal>, 'get' | 'set' | 'initial'> {
    create?(input: TRemote, params: SyncedSetParams<TRemote>): Promise<CrudResult<TRemote> | null | undefined>;
    update?(
        input: Partial<TRemote>,
        params: SyncedSetParams<TRemote>,
    ): Promise<CrudResult<Partial<TRemote> | null | undefined>>;
    delete?(input: { id: TRemote['id'] }, params: SyncedSetParams<TRemote>): Promise<CrudResult<any>>;
    onSaved?(params: SyncedCrudOnSavedParams<TRemote, TLocal>): Partial<TLocal> | void;
    onSavedUpdate?: 'createdUpdatedAt';
    fieldUpdatedAt?: string;
    fieldCreatedAt?: string;
    fieldDeleted?: string;
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

function ensureId(obj: { id: string | number }, generateId: () => string | number) {
    if (!obj.id) {
        obj.id = generateId();
    }
    return obj.id;
}

function onSavedCreatedUpdatedAt<TRemote extends { id: string | number }, TLocal>(
    mode: SyncedCrudPropsBase<TRemote>['onSavedUpdate'],
    { saved, currentValue, isCreate, props }: SyncedCrudOnSavedParams<TRemote, TLocal>,
): Partial<TLocal> {
    const savedOut: Partial<TLocal> = {};

    if (isCreate) {
        // Update with any fields that are currently undefined
        Object.keys(saved!).forEach((key) => {
            if (isNullOrUndefined(currentValue[key as keyof TLocal])) {
                savedOut[key as keyof TLocal] = saved[key as keyof TLocal];
            }
        });
    } else if (mode === 'createdUpdatedAt') {
        // Update with any fields ending in createdAt or updatedAt
        Object.keys(saved!).forEach((key) => {
            const k = key as keyof TLocal;
            const keyLower = key.toLowerCase();
            if (
                (key === props.fieldCreatedAt ||
                    key === props.fieldUpdatedAt ||
                    keyLower.endsWith('createdat') ||
                    keyLower.endsWith('updatedat')) &&
                saved[k] instanceof Date
            ) {
                savedOut[k] = saved[k];
            }
        });
    }

    return savedOut;
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
        fieldDeleted,
        updatePartial,
        onSaved,
        onSavedUpdate,
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
                  const { updateLastSync, lastSync, value } = getParams;
                  if (listFn) {
                      const isLastSyncMode = changesSince === 'last-sync';
                      if (isLastSyncMode && lastSync) {
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
                          return transformed.length > 0
                              ? transformed[0]
                              : (isLastSyncMode && lastSync && value) || null;
                      } else {
                          const out: Record<string, any> = asMap ? new Map() : {};
                          transformed.forEach((result: any) => {
                              const value =
                                  result[fieldDeleted as any] || result.__deleted ? internal.symbolDelete : result;
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
                  const { value, changes, update, retryAsCreate, valuePrevious, node } = params;
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
                                      updates.set(id, Object.assign(updates.get(id) || { id }, value));
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
                                      deletes.add(itemKey);
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
                      if (data && (onSaved || onSavedUpdate)) {
                          const saved: TLocal = (transform?.load ? transform.load(data as any, 'set') : data) as any;

                          const isChild = itemKey !== 'undefined' && asType !== 'first';
                          const currentPeeked = getNodeValue(node);

                          const currentValue = isChild ? currentPeeked?.[itemKey] : currentPeeked;

                          const dataOnSaved: SyncedCrudOnSavedParams<TRemote, TLocal> = {
                              saved,
                              input,
                              currentValue,
                              isCreate,
                              props,
                          };
                          let savedOut: Partial<TLocal> | undefined = undefined;

                          if (onSavedUpdate) {
                              savedOut = onSavedCreatedUpdatedAt(onSavedUpdate, dataOnSaved);
                          }

                          if (onSaved) {
                              const ret = onSaved(dataOnSaved);
                              if (ret) {
                                  savedOut = ret;
                              }
                          }

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
                              return updateFn!(changed, params).then(
                                  (result) => result && saveResult(itemKey, changed, result as any, false),
                              );
                          }
                      }),
                      ...Array.from(deletes).map((id) => {
                          if (fieldDeleted && updateFn) {
                              updateFn({ id, [fieldDeleted]: true } as any, params);
                          } else if (deleteFn) {
                              deleteFn({ id }, params);
                          } else {
                              console.log('[legend-state] missing delete function');
                          }
                      }),
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
