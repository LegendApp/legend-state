import ksuid from 'ksuid';
import { WaitForSetFnParams, computeSelector, internal, isEmpty, isFunction, observable, when } from '@legendapp/state';
import {
    SyncedGetSetSubscribeBaseParams,
    SyncedOptions,
    removeNullUndefined,
    type SyncedGetParams,
    type SyncedSetParams,
    type SyncedSubscribeParams,
} from '@legendapp/state/sync';
import {
    CrudAsOption,
    CrudResult,
    SyncedCrudOnSavedParams,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudPropsSingle,
    SyncedCrudReturnType,
    syncedCrud,
} from '@legendapp/state/sync-plugins/crud';
const { clone } = internal;

// Keel types
export interface KeelObjectBase {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}
export type KeelKey = 'createdAt' | 'updatedAt';
export const KeelKeys: KeelKey[] = ['createdAt', 'updatedAt'];
export type OmitKeelBuiltins<T, T2 extends string = ''> = Omit<T, KeelKey | T2>;
type APIError = { type: string; message: string; requestId?: string };

type APIResult<T> = Result<T, APIError>;

type Data<T> = {
    data: T;
    error?: never;
};

type Err<U> = {
    data?: never;
    error: U;
};

type Result<T, U> = NonNullable<Data<T> | Err<U>>;

// Keel plugin types

type SubscribeFn = (params: SyncedGetSetSubscribeBaseParams) => () => void;

export function generateKeelId() {
    return ksuid.randomSync().string;
}

export interface KeelGetParams {}

export interface KeelListParams<Where = {}> {
    where: { updatedAt?: { after: Date } } & Where;
    after?: string;
    first?: number;
    last?: number;
    before?: string;
}

export interface KeelRealtimePlugin {
    subscribe: (realtimeKey: string, params: SyncedGetSetSubscribeBaseParams) => void;
    setLatestChange: (realtimeKey: string, time: Date) => void;
}

export interface SyncedKeelConfiguration
    extends Omit<
        SyncedCrudPropsBase<any>,
        | keyof SyncedOptions
        | 'create'
        | 'update'
        | 'delete'
        | 'onSaved'
        | 'updatePartial'
        | 'fieldCreatedAt'
        | 'fieldUpdatedAt'
        | 'generateId'
    > {
    client: {
        auth: { refresh: () => Promise<boolean>; isAuthenticated: () => Promise<boolean> };
        api: { queries: Record<string, (i: any) => Promise<any>> };
    };
    realtimePlugin?: KeelRealtimePlugin;
    as?: Exclude<CrudAsOption, 'value'>;
    enabled?: boolean;
    onError?: (params: {
        type: 'create' | 'update' | 'delete';
        params: SyncedSetParams<any>;
        input: any;
        action: string;
        error: APIResult<any>['error'];
    }) => void;
    refreshAuth?: () => void | Promise<void>;
}

interface PageInfo {
    count: number;
    endCursor: string;
    hasNextPage: boolean;
    startCursor: string;
    totalCount: number;
}

interface SyncedKeelPropsManyBase<TRemote extends { id: string }, TLocal, AOption extends CrudAsOption>
    extends Omit<SyncedCrudPropsMany<TRemote, TLocal, AOption>, 'list'> {
    first?: number;
    get?: never;
}
interface SyncedKeelPropsManyWhere<
    TRemote extends { id: string },
    TLocal,
    AOption extends CrudAsOption,
    Where extends Record<string, any>,
> extends SyncedKeelPropsManyBase<TRemote, TLocal, AOption> {
    list?: (params: KeelListParams<NoInfer<Where>>) => Promise<
        CrudResult<
            APIResult<{
                results: TRemote[];
                pageInfo: any;
            }>
        >
    >;
    where?: Where | (() => Where);
}
interface SyncedKeelPropsManyNoWhere<TRemote extends { id: string }, TLocal, AOption extends CrudAsOption>
    extends SyncedKeelPropsManyBase<TRemote, TLocal, AOption> {
    list?: (params: KeelListParams<{}>) => Promise<
        CrudResult<
            APIResult<{
                results: TRemote[];
                pageInfo: any;
            }>
        >
    >;
    where?: never | {};
}
type HasAnyKeys<T> = keyof T extends never ? false : true;

type SyncedKeelPropsMany<
    TRemote extends { id: string },
    TLocal,
    AOption extends CrudAsOption,
    Where extends Record<string, any>,
> =
    HasAnyKeys<Where> extends true
        ? SyncedKeelPropsManyWhere<TRemote, TLocal, AOption, Where>
        : SyncedKeelPropsManyNoWhere<TRemote, TLocal, AOption>;

interface SyncedKeelPropsSingle<TRemote extends { id: string }, TLocal>
    extends Omit<SyncedCrudPropsSingle<TRemote, TLocal>, 'get'> {
    get?: (params: KeelGetParams) => Promise<APIResult<TRemote>>;

    first?: never;
    where?: never;
    list?: never;
    as?: never;
}

interface SyncedKeelPropsBase<TRemote extends { id: string }, TLocal = TRemote>
    extends Omit<
        SyncedCrudPropsBase<TRemote, TLocal>,
        'create' | 'update' | 'delete' | 'updatePartial' | 'fieldUpdatedAt' | 'fieldCreatedAt'
    > {
    create?: (i: NoInfer<Partial<TRemote>>) => Promise<APIResult<NoInfer<TRemote>>>;
    update?: (params: { where: any; values?: Partial<TRemote> }) => Promise<APIResult<TRemote>>;
    delete?: (params: { id: string }) => Promise<APIResult<string>>;
}

const keelConfig: SyncedKeelConfiguration = {} as SyncedKeelConfiguration;
const modifiedClients = new WeakSet<Record<string, any>>();
const isEnabled$ = observable(true);

async function ensureAuthToken() {
    await when(isEnabled$.get());

    if (keelConfig.refreshAuth) {
        await keelConfig.refreshAuth();
    }

    let isAuthed = await keelConfig.client.auth.isAuthenticated();
    if (!isAuthed) {
        isAuthed = await keelConfig.client.auth.refresh();
    }

    return isAuthed;
}

async function handleApiError(error: APIError, retry?: () => any) {
    if (error.type === 'unauthorized' || error.type === 'forbidden') {
        console.warn('Keel token expired, refreshing...');
        await ensureAuthToken();
        // Retry
        retry?.();
    }
}

function convertObjectToCreate<TRemote>(item: TRemote): TRemote {
    const cloned = clone(item);
    Object.keys(cloned).forEach((key) => {
        if (key.endsWith('Id')) {
            if (cloned[key]) {
                cloned[key.slice(0, -2)] = { id: cloned[key] };
            }
            delete cloned[key];
        }
    });
    delete cloned.createdAt;
    delete cloned.updatedAt;
    return cloned as unknown as TRemote;
}

export function getSyncedKeelConfiguration() {
    return keelConfig;
}
export function configureSyncedKeel(config: SyncedKeelConfiguration) {
    const { enabled, realtimePlugin, client, ...rest } = config;
    Object.assign(keelConfig, removeNullUndefined(rest));

    if (enabled !== undefined) {
        isEnabled$.set(enabled);
    }

    if (realtimePlugin) {
        keelConfig.realtimePlugin = realtimePlugin;
        if (client && !modifiedClients.has(client)) {
            modifiedClients.add(client);
            const queries = client.api.queries;
            Object.keys(queries).forEach((key) => {
                if (key.startsWith('list')) {
                    const oldFn = queries[key];
                    queries[key] = (i) => {
                        const realtimeKey = [key, ...Object.values(i.where || {})]
                            .filter((value) => value && typeof value !== 'object')
                            .join('/');

                        const subscribe = (params: SyncedSubscribeParams) => {
                            if (realtimeKey) {
                                return realtimePlugin.subscribe(realtimeKey, params);
                            }
                        };
                        return oldFn(i).then((ret) => {
                            if (subscribe) {
                                ret.subscribe = subscribe;
                                ret.subscribeKey = realtimeKey;
                            }
                            return ret;
                        });
                    };
                }
            });
        }
    }
}

const NumPerPage = 200;
async function getAllPages<TRemote>(
    listFn: (params: KeelListParams<any>) => Promise<
        APIResult<{
            results: TRemote[];
            pageInfo: any;
        }>
    >,
    params: KeelListParams,
): Promise<{ results: TRemote[]; subscribe: SubscribeFn; subscribeKey: string }> {
    const allData: TRemote[] = [];
    let pageInfo: PageInfo | undefined = undefined;
    let subscribe_;
    let subscribeKey_;

    const { first: firstParam } = params;

    do {
        const first = firstParam ? Math.min(firstParam - allData.length, NumPerPage) : NumPerPage;
        if (first < 1) {
            break;
        }
        const pageEndCursor = pageInfo?.endCursor;
        const paramsWithCursor: KeelListParams = pageEndCursor
            ? { first, ...params, after: pageEndCursor }
            : { first, ...params };
        pageInfo = undefined;
        const ret = await listFn(paramsWithCursor);

        if (ret) {
            // @ts-expect-error TODOKEEL
            const { data, error, subscribe, subscribeKey } = ret;

            if (subscribe) {
                subscribe_ = subscribe;
                subscribeKey_ = subscribeKey;
            }

            if (error) {
                await handleApiError(error);
                throw new Error(error.message);
            } else if (data) {
                pageInfo = data.pageInfo as PageInfo;
                allData.push(...data.results);
            }
        }
    } while (pageInfo?.hasNextPage);

    return { results: allData, subscribe: subscribe_, subscribeKey: subscribeKey_ };
}

export function syncedKeel<TRemote extends { id: string }, TLocal = TRemote>(
    props: SyncedKeelPropsBase<TRemote, TLocal> & SyncedKeelPropsSingle<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, 'value'>;
export function syncedKeel<
    TRemote extends { id: string },
    TLocal = TRemote,
    TOption extends CrudAsOption = 'object',
    Where extends Record<string, any> = {},
>(
    props: SyncedKeelPropsBase<TRemote, TLocal> & SyncedKeelPropsMany<TRemote, TLocal, TOption, Where>,
): SyncedCrudReturnType<TLocal, Exclude<TOption, 'value'>>;
export function syncedKeel<
    TRemote extends { id: string },
    TLocal = TRemote,
    TOption extends CrudAsOption = 'object',
    Where extends Record<string, any> = {},
>(
    props: SyncedKeelPropsBase<TRemote, TLocal> &
        (SyncedKeelPropsSingle<TRemote, TLocal> | SyncedKeelPropsMany<TRemote, TLocal, TOption, Where>),
): SyncedCrudReturnType<TLocal, TOption> {
    const { realtimePlugin } = keelConfig;
    props = { ...keelConfig, ...props } as any;

    const {
        get: getParam,
        list: listParam,
        create: createParam,
        update: updateParam,
        delete: deleteParam,
        first,
        where: whereParam,
        waitFor,
        waitForSet,
        fieldDeleted,
        mode,
        ...rest
    } = props;

    const { changesSince } = props;

    const asType: TOption = getParam ? ('value' as TOption) : props.as!;

    let subscribeFn: SubscribeFn;
    const subscribeFnKey$ = observable('');

    const fieldCreatedAt: KeelKey = 'createdAt';
    const fieldUpdatedAt: KeelKey = 'updatedAt';

    const setupSubscribe = (doSubscribe: SubscribeFn, subscribeKey: string, lastSync?: number | undefined) => {
        subscribeFn = doSubscribe;
        subscribeFnKey$.set(subscribeKey);
        if (realtimePlugin && lastSync) {
            realtimePlugin.setLatestChange(subscribeKey, new Date(lastSync));
        }
    };

    const list = listParam
        ? async (listParams: SyncedGetParams<TRemote>) => {
              const { lastSync } = listParams;
              const queryBySync = !!lastSync && changesSince === 'last-sync';
              // If querying with lastSync pass it to the "where" parameters
              const where = Object.assign(
                  queryBySync ? { updatedAt: { after: new Date(lastSync + 1) } } : {},
                  isFunction(whereParam) ? whereParam() : whereParam,
              );
              const params: KeelListParams = { where, first };

              // TODO: Error?
              const { results, subscribe, subscribeKey } = await getAllPages(listParam, params);
              if (subscribe) {
                  setupSubscribe(() => subscribe(listParams), subscribeKey, lastSync);
              }

              return results;
          }
        : undefined;

    const get = getParam
        ? async (getParams: SyncedGetParams<TRemote>) => {
              const { refresh } = getParams;
              const { data, error, subscribe, subscribeKey } = (await getParam({ refresh })) as APIResult<TRemote> & {
                  subscribe: SubscribeFn;
                  subscribeKey: string;
              };
              if (subscribe) {
                  setupSubscribe(() => subscribe(getParams), subscribeKey);
              }

              if (error) {
                  throw new Error(error.message);
              } else {
                  return data as TRemote;
              }
          }
        : undefined;

    const onSaved = ({ saved }: SyncedCrudOnSavedParams<TRemote, TLocal>): Partial<TLocal> | void => {
        if (saved) {
            const updatedAt = saved[fieldUpdatedAt as keyof TLocal] as Date;

            if (updatedAt && realtimePlugin) {
                const subscribeFnKey = subscribeFnKey$.get();
                if (subscribeFnKey) {
                    realtimePlugin.setLatestChange(subscribeFnKey, updatedAt);
                }
            }
        }
    };

    const handleSetError = async (
        error: APIError,
        params: SyncedSetParams<TRemote>,
        input: TRemote,
        fn: Function,
        from: 'create' | 'update' | 'delete',
    ) => {
        const { retryNum, update } = params;

        if (
            from === 'create' &&
            (error.message as string)?.includes('for the unique') &&
            (error.message as string)?.includes('must be unique')
        ) {
            if (__DEV__) {
                console.log('Creating duplicate data already saved, just ignore.');
            }
            params.cancelRetry = true;
            // This has already been saved but didn't update pending changes, so just update with {} to clear the pending state
            update({
                value: {} as TRemote,
                mode: 'assign',
            });
        } else if (from === 'delete') {
            if (error.message === 'record not found') {
                if (__DEV__) {
                    console.log('Deleting non-existing data, just ignore.');
                }
                params.cancelRetry = true;
            }
        } else if (error.type === 'bad_request') {
            keelConfig.onError?.({ error, params, input, type: from, action: fn.name || fn.toString() });

            if (retryNum > 4) {
                params.cancelRetry = true;
            }

            throw new Error(error.message);
        } else {
            await handleApiError(error);

            throw new Error(error.message);
        }
    };

    const create = createParam
        ? async (input: TRemote, params: SyncedSetParams<TRemote>) => {
              const { data, error } = await createParam(convertObjectToCreate(input));

              if (error) {
                  await handleSetError(error, params, input, createParam, 'create');
              }

              return data;
          }
        : undefined;

    const update = updateParam
        ? async (input: TRemote, params: SyncedSetParams<TRemote>) => {
              const id = input.id;
              const values = convertObjectToCreate(input as unknown as Partial<KeelObjectBase>) as Partial<TRemote> &
                  Partial<KeelObjectBase>;
              delete values.id;
              delete values.createdAt;
              delete values.updatedAt;
              if (!isEmpty(values)) {
                  const { data, error } = await updateParam({ where: { id }, values });

                  if (error) {
                      await handleSetError(error, params, input, updateParam, 'update');
                  }

                  return data;
              }
          }
        : undefined;
    const deleteFn = deleteParam
        ? async (value: TRemote, params: SyncedSetParams<TRemote>) => {
              const { data, error } = await deleteParam({ id: value.id });

              if (error) {
                  await handleSetError(error, params, value, deleteParam, 'delete');
              }

              return data;
          }
        : undefined;

    const subscribe = (params: SyncedSubscribeParams<TRemote[]>) => {
        let unsubscribe: undefined | (() => void) = undefined;
        when(subscribeFnKey$, () => {
            unsubscribe = subscribeFn!(params);
        });
        return () => {
            unsubscribe?.();
        };
    };

    return syncedCrud<TRemote, TLocal, TOption>({
        ...rest,
        as: asType,
        mode: mode || 'merge',
        list,
        create,
        update,
        delete: deleteFn,
        waitFor: () => isEnabled$.get() && (waitFor ? computeSelector(waitFor) : true),
        waitForSet: (params: WaitForSetFnParams<any>) =>
            isEnabled$.get() && (waitForSet ? (isFunction(waitForSet) ? waitForSet(params) : waitForSet) : true),
        onSaved,
        fieldCreatedAt,
        fieldUpdatedAt,
        fieldDeleted,
        changesSince,
        updatePartial: true,
        subscribe,
        generateId: generateKeelId,
        // @ts-expect-error This errors because of the get/list union type
        get,
    }) as SyncedCrudReturnType<TLocal, TOption>;
}
