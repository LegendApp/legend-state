import { batch, isEmpty, isFunction, observable, when } from '@legendapp/state';
import {
    createRevertChanges,
    type SyncedGetParams,
    type SyncedGetSetSubscribeBaseParams,
    type SyncedSetParams,
    type SyncedSubscribeParams,
} from '@legendapp/state/sync';
import {
    CrudAsOption,
    CrudErrorParams,
    CrudResult,
    SyncedCrudOnSavedParams,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudPropsSingle,
    SyncedCrudReturnType,
    WaitForSetCrudFnParams,
    syncedCrud,
} from '@legendapp/state/sync-plugins/crud';

// Keel types
export interface KeelObjectBase {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}
export type KeelKey = 'createdAt' | 'updatedAt';
export const KeelKeys: KeelKey[] = ['createdAt', 'updatedAt'];
export type OmitKeelBuiltins<T, T2 extends string = ''> = Omit<T, KeelKey | T2>;
type APIError = { type: string; message: string; requestId?: string; error?: unknown };

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

export interface KeelGetParams {}

export interface KeelListParams<Where = {}> {
    where: { updatedAt?: { after: Date } } & Where;
    after?: string;
    first?: number;
    last?: number;
    before?: string;
}

export interface KeelRealtimePlugin {
    subscribe: (realtimeKey: string, params: SyncedGetSetSubscribeBaseParams) => () => void;
    setSaved: (realtimeKey: string) => void;
}

export interface KeelClient {
    auth: {
        refresh: () => Promise<APIResult<boolean>>;
        isAuthenticated: () => Promise<APIResult<boolean>>;
    };
    api: { queries: Record<string, (i: any) => Promise<any>> };
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
                pageInfo?: any;
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
                pageInfo?: any;
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

export interface KeelErrorParams extends CrudErrorParams {
    action: string;
}

export interface SyncedKeelPropsBase<TRemote extends { id: string }, TLocal = TRemote>
    extends Omit<
        SyncedCrudPropsBase<TRemote, TLocal>,
        'create' | 'update' | 'delete' | 'updatePartial' | 'fieldUpdatedAt' | 'fieldCreatedAt' | 'onError'
    > {
    client?: KeelClient;
    create?: (i: NoInfer<Partial<TRemote>>) => Promise<APIResult<NoInfer<TRemote>>>;
    update?: (params: { where: any; values?: Partial<NoInfer<TRemote>> }) => Promise<APIResult<TRemote>>;
    delete?: (params: { id: string }) => Promise<APIResult<string>>;
    realtime?: {
        path?: (action: string, inputs: any) => string | Promise<string>;
        plugin?: KeelRealtimePlugin;
    };
    refreshAuth?: () => void | Promise<void>;
    requireAuth?: boolean;
    onError?: (error: Error, params: KeelErrorParams) => void;
}

type OnErrorFn = (error: Error, params: KeelErrorParams) => void;

const modifiedClients = new WeakSet<Record<string, any>>();
const isAuthed$ = observable(false);
const isAuthing$ = observable(false);

async function ensureAuthToken(props: SyncedKeelPropsBase<any>, force?: boolean) {
    if (!force && isAuthed$.get()) {
        return true;
    }
    const { client, refreshAuth } = props;

    let isAuthed = await client!.auth.isAuthenticated().then(({ data }) => data);
    if (!isAuthed) {
        // If already authing wait for that instead of doing it again
        if (!force && isAuthing$.get()) {
            return when(
                () => !isAuthing$.get(),
                () => isAuthed$.get(),
            );
        }

        isAuthing$.set(true);
        // Refresh the auth using the configured method
        if (refreshAuth) {
            await refreshAuth();
        }

        isAuthed = await client!.auth.isAuthenticated().then(({ data }) => data);
        if (!isAuthed) {
            // Try refreshing directly on keel client
            isAuthed = await client!.auth.refresh().then(({ data }) => data);
        }
    }

    if (isAuthed) {
        // If successful then set authed
        batch(() => {
            isAuthed$.set(true);
            isAuthing$.set(false);
        });
    } else {
        // TODO: Exponential backoff this?
        setTimeout(() => ensureAuthToken(props, /*force*/ true), 1000);
    }

    return isAuthed;
}

async function handleApiError(props: SyncedKeelPropsBase<any>, error: APIError) {
    if (error.type === 'unauthorized' || error.type === 'forbidden') {
        console.warn('Keel token expired, refreshing...');
        isAuthed$.set(false);
        await ensureAuthToken(props);
        return true;
    } else if ((error.error as Error)?.message === 'Failed to fetch') {
        // Just throw to retry, don't need to report it to user
        throw error.error;
    }
    return false;
}

function convertObjectToCreate<TRemote extends Record<string, any>>(item: TRemote): TRemote {
    const cloned: Record<string, any> = {};
    Object.keys(item).forEach((key) => {
        if (key.endsWith('Id')) {
            if (item[key]) {
                cloned[key.slice(0, -2)] = { id: item[key] };
            }
        } else if (key !== 'createdAt' && key !== 'updatedAt') {
            if (item[key] === undefined) {
                cloned[key] = null;
            } else {
                cloned[key] = item[key];
            }
        }
    });
    return cloned as unknown as TRemote;
}

const realtimeState: {
    current: {
        lastAction?: string;
        lastParams?: any;
    };
} = { current: {} };

function setupRealtime(props: SyncedKeelPropsBase<any>) {
    const { client } = props;
    if (client && !modifiedClients.has(client)) {
        modifiedClients.add(client);
        const queries = client.api.queries;
        Object.keys(queries).forEach((key) => {
            if (key.startsWith('list')) {
                const origFn = queries[key];
                queries[key] = (i) => {
                    realtimeState.current = {
                        lastAction: key,
                        lastParams: i,
                    };

                    return origFn(i);
                };
            }
        });
    }
}

const NumPerPage = 200;
async function getAllPages<TRemote>(
    props: SyncedKeelPropsBase<any>,
    listFn: (params: KeelListParams<any>) => Promise<
        APIResult<{
            results: TRemote[];
            pageInfo?: any;
        }>
    >,
    params: KeelListParams,
    listParams: SyncedGetParams<TRemote>,
    onError: (error: Error, params: KeelErrorParams) => void,
): Promise<TRemote[]> {
    const allData: TRemote[] = [];
    let pageInfo: PageInfo | undefined = undefined;

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
            const { data, error } = ret;

            if (error) {
                const handled = await handleApiError(props, error);

                if (!handled) {
                    const err = new Error(error.message, { cause: { error } });
                    onError(err, {
                        getParams: listParams,
                        type: 'get',
                        source: 'list',
                        action: listFn.name || listFn.toString(),
                        retry: listParams,
                    });
                }
            } else if (data) {
                pageInfo = data.pageInfo as PageInfo;
                allData.push(...data.results);
            }
        }
    } while (pageInfo?.hasNextPage);

    return allData;
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
    const {
        get: getParam,
        list: listParam,
        create: createParam,
        update: updateParam,
        delete: deleteParam,
        subscribe: subscribeParam,
        first,
        where: whereParam,
        waitFor,
        waitForSet,
        fieldDeleted,
        realtime,
        mode,
        requireAuth = true,
        ...rest
    } = props;

    const { changesSince } = props;

    const asType: TOption = getParam ? ('value' as TOption) : props.as!;

    let subscribeFn: SubscribeFn;
    const subscribeFnKey$ = observable('');

    const fieldCreatedAt: KeelKey = 'createdAt';
    const fieldUpdatedAt: KeelKey = 'updatedAt';

    const setupSubscribe = realtime
        ? async (getParams: SyncedGetParams<TRemote>) => {
              const { lastAction, lastParams } = realtimeState.current;
              const { path, plugin } = realtime;
              if (lastAction && path && plugin) {
                  const key = await path(lastAction, lastParams);
                  subscribeFn = () => realtime.plugin!.subscribe(key, getParams);
                  subscribeFnKey$.set(key);
              }
          }
        : undefined;

    const list = listParam
        ? async (listParams: SyncedGetParams<TRemote>) => {
              const { lastSync, onError } = listParams;
              const queryBySync = !!lastSync && changesSince === 'last-sync';
              // If querying with lastSync pass it to the "where" parameters
              const where = Object.assign(
                  queryBySync ? { updatedAt: { after: new Date(lastSync + 1) } } : {},
                  isFunction(whereParam) ? whereParam() : whereParam,
              );
              const params: KeelListParams = { where, first };

              realtimeState.current = {};

              const promise = getAllPages(props, listParam, params, listParams, onError as OnErrorFn);

              if (realtime) {
                  setupSubscribe!(listParams);
              }

              return promise;
          }
        : undefined;

    const get = getParam
        ? async (getParams: SyncedGetParams<TRemote>) => {
              const { refresh, onError } = getParams;

              realtimeState.current = {};

              const promise = getParam({ refresh });

              if (realtime) {
                  setupSubscribe!(getParams);
              }

              const { data, error } = await promise;

              if (error) {
                  const handled = await handleApiError(props, error);

                  if (!handled) {
                      const err = new Error(error.message, { cause: { error } });
                      (onError as OnErrorFn)(err, {
                          getParams,
                          type: 'get',
                          source: 'get',
                          action: getParam.name || getParam.toString(),
                          retry: getParams,
                      });
                  }
              } else {
                  return data as TRemote;
              }
          }
        : undefined;

    const onSaved = ({ saved }: SyncedCrudOnSavedParams<TRemote, TLocal>): Partial<TLocal> | void => {
        if (saved) {
            if (realtime?.plugin) {
                const subscribeFnKey = subscribeFnKey$.get();
                if (subscribeFnKey) {
                    realtime?.plugin.setSaved(subscribeFnKey);
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
        const { update, onError } = params;

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
        } else if (from === 'delete' && error.message === 'record not found') {
            if (__DEV__) {
                console.log('Deleting non-existing data, just ignore.');
            }
            params.cancelRetry = true;
        } else {
            const handled = await handleApiError(props, error);

            if (!handled) {
                const err = new Error(error.message, { cause: { error } });
                (onError as OnErrorFn)(err, {
                    setParams: params,
                    input,
                    type: 'set',
                    source: from,
                    action: fn.name || fn.toString(),
                    retry: params,
                    revert: createRevertChanges(params.value$, params.changes),
                });
            }
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

    if (realtime) {
        setupRealtime(props);
    }

    const subscribe = realtime
        ? (params: SyncedSubscribeParams<TRemote[]>) => {
              let unsubscribe: undefined | (() => void) = undefined;
              when(subscribeFnKey$, () => {
                  unsubscribe = subscribeFn!(params);
              });
              const unsubscribeParam = subscribeParam?.(params);
              return () => {
                  unsubscribe?.();
                  unsubscribeParam?.();
              };
          }
        : subscribeParam;

    return syncedCrud<TRemote, TLocal, TOption>({
        ...(rest as any), // Workaround for type errors
        as: asType,
        mode: mode || 'merge',
        list,
        create,
        update,
        delete: deleteFn,
        waitFor: () => {
            ensureAuthToken(props);
            return [requireAuth ? isAuthed$ : true, waitFor || true];
        },
        waitForSet: (params: WaitForSetCrudFnParams<any>) => {
            ensureAuthToken(props);
            return [
                requireAuth ? isAuthed$ : true,
                () => (waitForSet ? (isFunction(waitForSet) ? waitForSet(params) : waitForSet) : true),
            ];
        },
        onSaved,
        fieldCreatedAt,
        fieldUpdatedAt,
        fieldDeleted,
        changesSince,
        updatePartial: true,
        subscribe,
        get,
    }) as SyncedCrudReturnType<TLocal, TOption>;
}
