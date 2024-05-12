import { computeSelector, observable, when, internal, isFunction } from '@legendapp/state';
import {
    SyncedOptions,
    removeNullUndefined,
    type SyncedGetParams,
    type SyncedSetParams,
    type SyncedSubscribeParams,
} from '@legendapp/state/sync';
import {
    CrudAsOption,
    CrudResult,
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

export interface KeelGetParams {}

export interface KeelListParams<Where = {}> {
    where: { updatedAt?: { after: Date } } & Where;
    after?: string;
    first?: number;
    last?: number;
    before?: string;
}

export interface KeelRealtimePlugin {
    subscribe: (realtimeKey: string, refresh: () => void) => void;
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
    > {
    client: {
        auth: { refresh: () => Promise<boolean>; isAuthenticated: () => Promise<boolean> };
        api: { queries: Record<string, (i: any) => Promise<any>> };
    };
    realtimePlugin?: KeelRealtimePlugin;
    as?: Exclude<CrudAsOption, 'first'>;
    enabled?: boolean;
    onError?: (params: APIResult<any>['error']) => void;
}

interface PageInfo {
    count: number;
    endCursor: string;
    hasNextPage: boolean;
    startCursor: string;
    totalCount: number;
}

interface SyncedKeelPropsManyBase<TRemote, TLocal, AOption extends CrudAsOption>
    extends Omit<SyncedCrudPropsMany<TRemote, TLocal, AOption>, 'list'> {
    first?: number;
    get?: never;
}
interface SyncedKeelPropsManyWhere<TRemote, TLocal, AOption extends CrudAsOption, Where extends Record<string, any>>
    extends SyncedKeelPropsManyBase<TRemote, TLocal, AOption> {
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
interface SyncedKeelPropsManyNoWhere<TRemote, TLocal, AOption extends CrudAsOption>
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
    TRemote,
    TLocal,
    AOption extends CrudAsOption,
    Where extends Record<string, any>,
> = HasAnyKeys<Where> extends true
    ? SyncedKeelPropsManyWhere<TRemote, TLocal, AOption, Where>
    : SyncedKeelPropsManyNoWhere<TRemote, TLocal, AOption>;

interface SyncedKeelPropsSingle<TRemote, TLocal> extends Omit<SyncedCrudPropsSingle<TRemote, TLocal>, 'get'> {
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

export function configureSyncedKeel(config: SyncedKeelConfiguration) {
    const { enabled, realtimePlugin, ...rest } = config;
    Object.assign(keelConfig, removeNullUndefined(rest));

    if (enabled !== undefined) {
        isEnabled$.set(enabled);
    }
    const { client } = keelConfig;

    if (realtimePlugin) {
        keelConfig.realtimePlugin = realtimePlugin;
        if (client && !modifiedClients.has(client)) {
            modifiedClients.add(client);
            const queries = client.api.queries;
            Object.keys(queries).forEach((key) => {
                const oldFn = queries[key];
                queries[key] = (i) => {
                    const subscribe =
                        key.startsWith('list') &&
                        i.where &&
                        (({ refresh }: SyncedSubscribeParams) => {
                            const realtimeChild = Object.values(i.where)
                                .filter((value) => value && typeof value !== 'object')
                                .join('/');

                            if (realtimeChild) {
                                const realtimeKey = `${key}/${realtimeChild}`;

                                realtimePlugin.subscribe(realtimeKey, refresh);
                                return realtimeKey;
                            }
                        });
                    return oldFn(i).then((ret) => {
                        if (subscribe) {
                            ret.subscribe = subscribe;
                        }
                        return ret;
                    });
                };
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
): Promise<{ results: TRemote[]; subscribe: (params: { refresh: () => void }) => string }> {
    const allData: TRemote[] = [];
    let pageInfo: PageInfo | undefined = undefined;
    let subscribe_;

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
            const { data, error, subscribe } = ret;

            if (subscribe) {
                subscribe_ = subscribe;
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

    return { results: allData, subscribe: subscribe_ };
}

export function syncedKeel<TRemote extends { id: string }, TLocal = TRemote>(
    props: SyncedKeelPropsBase<TRemote, TLocal> & SyncedKeelPropsSingle<TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, 'first'>;
export function syncedKeel<
    TRemote extends { id: string },
    TLocal = TRemote,
    TOption extends CrudAsOption = 'object',
    Where extends Record<string, any> = {},
>(
    props: SyncedKeelPropsBase<TRemote, TLocal> & SyncedKeelPropsMany<TRemote, TLocal, TOption, Where>,
): SyncedCrudReturnType<TLocal, Exclude<TOption, 'first'>>;
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
        first,
        where: whereParam,
        waitFor,
        generateId: generateIdParam,
        ...rest
    } = props;

    const { changesSince } = props;

    let asType = props.as as TOption;

    if (!asType) {
        asType = (getParam ? 'first' : keelConfig.as || undefined) as TOption;
    }

    const generateId = generateIdParam || keelConfig.generateId;

    const realtimePlugin = keelConfig.realtimePlugin;
    let realtimeKeyList: string | undefined = undefined;
    let realtimeKeyGet: string | undefined = undefined;

    const fieldCreatedAt: KeelKey = 'createdAt';
    const fieldUpdatedAt: KeelKey = 'updatedAt';

    const list = listParam
        ? async (listParams: SyncedGetParams) => {
              const { lastSync, refresh } = listParams;
              const queryBySync = !!lastSync && changesSince === 'last-sync';
              // If querying with lastSync pass it to the "where" parameters
              const where = Object.assign(
                  queryBySync ? { updatedAt: { after: new Date(+new Date(lastSync) + 1) } } : {},
                  isFunction(whereParam) ? whereParam() : whereParam,
              );
              const params: KeelListParams = { where, first };

              // TODO: Error?
              const { results, subscribe } = await getAllPages(listParam, params);
              if (!realtimeKeyList) {
                  realtimeKeyList = subscribe?.({ refresh });
              }

              return results;
          }
        : undefined;

    const get = getParam
        ? async (getParams: SyncedGetParams) => {
              const { refresh } = getParams;
              //   @ts-expect-error TODOKEEL
              const { data, error, subscribe } = await getParam({ refresh });
              if (!realtimeKeyGet) {
                  realtimeKeyGet = subscribe?.({ refresh });
              }

              if (error) {
                  throw new Error(error.message);
              } else {
                  return data as TRemote;
              }
          }
        : undefined;

    const onSaved = (data: TLocal) => {
        if (realtimePlugin && data) {
            const updatedAt = data[fieldUpdatedAt as keyof TLocal] as Date;

            if (updatedAt) {
                if (realtimeKeyGet) {
                    realtimePlugin.setLatestChange(realtimeKeyGet, updatedAt);
                }
                if (realtimeKeyList) {
                    realtimePlugin.setLatestChange(realtimeKeyList, updatedAt);
                }
            }
        }
    };

    const handleSetError = async (error: APIError, params: SyncedSetParams<TRemote>, isCreate: boolean) => {
        const { retryNum, cancelRetry, update } = params;

        if (
            isCreate &&
            (error.message as string)?.includes('for the unique') &&
            (error.message as string)?.includes('must be unique')
        ) {
            if (__DEV__) {
                console.log('Creating duplicate data already saved, just ignore.');
            }
            // This has already been saved but didn't update pending changes, so just update with {} to clear the pending state
            update({
                value: {},
                mode: 'assign',
            });
        } else if (error.type === 'bad_request') {
            keelConfig.onError?.(error);

            if (retryNum > 4) {
                cancelRetry();
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
                  handleSetError(error, params, true);
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

              const { data, error } = await updateParam({ where: { id }, values: values });

              if (error) {
                  handleSetError(error, params, false);
              }

              return data;
          }
        : undefined;
    const deleteFn = deleteParam
        ? async ({ id }: { id: string }, params: SyncedSetParams<TRemote>) => {
              const { data, error } = await deleteParam({ id });

              if (error) {
                  handleSetError(error, params, false);
              }

              return data;
          }
        : undefined;

    return syncedCrud<TRemote, TLocal, TOption>({
        ...rest,
        as: asType,
        list,
        create,
        update,
        delete: deleteFn,
        waitFor: () => isEnabled$.get() && (waitFor ? computeSelector(waitFor) : true),
        onSaved,
        fieldCreatedAt,
        fieldUpdatedAt,
        changesSince,
        updatePartial: true,
        generateId,
        // @ts-expect-error This errors because of the get/list union type
        get: get as any,
    }) as SyncedCrudReturnType<TLocal, TOption>;
}
