import { Observable, computeSelector, isFunction, isObject, observable, symbolDelete } from '@legendapp/state';
import {
    SyncTransform,
    SyncedErrorParams,
    SyncedOptions,
    SyncedOptionsGlobal,
    SyncedSetParams,
    combineTransforms,
    createRevertChanges,
    removeNullUndefined,
    transformStringifyDates,
    type SyncedGetParams,
    type SyncedSubscribeParams,
} from '@legendapp/state/sync';
import {
    CrudAsOption,
    CrudErrorParams,
    CrudOnErrorFn,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudReturnType,
    WaitForSetCrudFnParams,
    syncedCrud,
} from '@legendapp/state/sync-plugins/crud';
import type { FunctionsResponse } from '@supabase/functions-js';
import type { PostgrestFilterBuilder, PostgrestQueryBuilder } from '@supabase/postgrest-js';
import type { PostgrestError, PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';

// Unused types but maybe useful in the future so keeping them for now
type DatabaseOf<Client extends SupabaseClient> = Client extends SupabaseClient<infer TDB> ? TDB : never;

type SchemaNameOf<Client extends SupabaseClient> = keyof DatabaseOf<Client>;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type IsUnionOfStrings<T> = [T] extends [string] ? ([T] extends [UnionToIntersection<T>] ? false : true) : false;

export type SupabaseSchemaOf<Client extends SupabaseClient> =
    Client extends SupabaseClient<
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        infer _,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        infer __,
        infer Schema
    >
        ? Schema
        : never;
export type SupabaseTableOf<
    Client extends SupabaseClient,
    SchemaName extends SchemaNameOf<Client>,
> = DatabaseOf<Client>[SchemaName]['Tables'];

export type SupabaseCollectionOf<
    Client extends SupabaseClient,
    SchemaName extends SchemaNameOf<Client>,
> = keyof SupabaseTableOf<Client, IsUnionOfStrings<SchemaName> extends true ? 'public' : SchemaName>;

export type SupabaseRowOf<
    Client extends SupabaseClient,
    Collection extends SupabaseCollectionOf<Client, SchemaName>,
    SchemaName extends SchemaNameOf<Client>,
> = SupabaseTableOf<Client, SchemaName>[Collection]['Row'];

export type SyncedSupabaseConfig<TRemote extends { id: string | number }, TLocal> = Omit<
    SyncedCrudPropsBase<TRemote, TLocal>,
    'create' | 'update' | 'delete'
>;

export interface SyncedSupabaseConfiguration
    extends Omit<
        SyncedSupabaseConfig<{ id: string | number }, { id: string | number }>,
        'persist' | keyof SyncedOptions
    > {
    persist?: SyncedOptionsGlobal;
    enabled?: Observable<boolean>;
    as?: Exclude<CrudAsOption, 'value'>;
}

interface SyncedSupabaseProps<
    Client extends SupabaseClient<any, any>,
    Collection extends SupabaseCollectionOf<Client, SchemaName>,
    SchemaName extends SchemaNameOf<Client> = 'public',
    TOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection, SchemaName> = SupabaseRowOf<Client, Collection, SchemaName>,
    TLocal = TRemote,
> extends SyncedSupabaseConfig<TRemote, TLocal>,
        Omit<SyncedCrudPropsMany<TRemote, TRemote, TOption>, 'list'> {
    supabase?: Client;
    collection: Collection;
    schema?: SchemaName;
    select?: never;
    filter?: (
        select: PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>,
        params: SyncedGetParams<TRemote>,
    ) => PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>;
    actions?: ('create' | 'read' | 'update' | 'delete')[];
    realtime?: boolean | { schema?: string; filter?: string };
    stringifyDates?: boolean;
    list?: (
        ...params: Parameters<Required<SyncedCrudPropsMany<TRemote, TLocal, TOption>>['list']>
    ) => PromiseLike<PostgrestSingleResponse<TRemote[]>> | Promise<FunctionsResponse<NoInfer<TRemote>[]>>;
    create?: (
        ...params: Parameters<Required<SyncedCrudPropsBase<TRemote>>['create']>
    ) => PromiseLike<PostgrestSingleResponse<TRemote>> | Promise<FunctionsResponse<NoInfer<TRemote>>>;
    update?: (
        ...params: Parameters<Required<SyncedCrudPropsBase<TRemote>>['update']>
    ) => PromiseLike<PostgrestSingleResponse<TRemote>> | Promise<FunctionsResponse<NoInfer<TRemote>>>;
    delete?: (
        ...params: Parameters<Required<SyncedCrudPropsBase<TRemote>>['delete']>
    ) => PromiseLike<PostgrestSingleResponse<TRemote>> | Promise<FunctionsResponse<NoInfer<TRemote>>>;
}

interface SyncedSupabasePropsWithSelect<
    Client extends SupabaseClient<any, any>,
    Collection extends SupabaseCollectionOf<Client, SchemaName>,
    SchemaName extends SchemaNameOf<Client> = 'public',
    TOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection, SchemaName> = SupabaseRowOf<Client, Collection, SchemaName>,
    TLocal = TRemote,
> extends Omit<SyncedSupabaseProps<Client, Collection, SchemaName, TOption, TRemote, TLocal>, 'select'> {
    select: (
        query: PostgrestQueryBuilder<
            SupabaseSchemaOf<Client>,
            SupabaseTableOf<Client, SchemaName>[Collection],
            Collection
        >,
    ) => PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>;
}

let channelNum = 1;
const supabaseConfig: SyncedSupabaseConfiguration = {};
const isEnabled$ = observable(true);

export function getSyncedSupabaseConfiguration() {
    return supabaseConfig;
}
export function configureSyncedSupabase(config: SyncedSupabaseConfiguration) {
    const { enabled, ...rest } = config;
    if (enabled !== undefined) {
        isEnabled$.set(enabled);
    }
    Object.assign(supabaseConfig, removeNullUndefined(rest));
}

function wrapSupabaseFn(fn: (...args: any) => PromiseLike<any>, source: CrudErrorParams['source']) {
    return async (params: SyncedGetParams<any>, ...args: any) => {
        const { onError } = params;
        const { data, error } = await fn(params, ...args);
        if (error) {
            (onError as CrudOnErrorFn)(new Error(error.message), {
                getParams: params,
                source,
                type: 'get',
                retry: params,
            });
        }
        return data;
    };
}

function handleSupabaseError(
    error: PostgrestError,
    onError: (error: Error, params: SyncedErrorParams) => void,
    params: CrudErrorParams,
) {
    if (error.message?.includes('Failed to fetch')) {
        // Just throw to retry, don't need to report it to user
        throw error;
    } else {
        (onError as CrudOnErrorFn)(new Error(error.message), params);
    }
}

export function syncedSupabase<
    Client extends SupabaseClient<any, any>,
    Collection extends SupabaseCollectionOf<Client, SchemaName> & string,
    SchemaName extends SchemaNameOf<Client> = 'public',
    AsOption extends CrudAsOption = 'object',
    TRemote = SupabaseRowOf<Client, Collection, SchemaName>,
    TLocal = TRemote,
>(
    props: SyncedSupabasePropsWithSelect<Client, Collection, SchemaName, AsOption, TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, AsOption>;
export function syncedSupabase<
    Client extends SupabaseClient<any, any>,
    Collection extends SupabaseCollectionOf<Client, SchemaName> & string,
    SchemaName extends SchemaNameOf<Client> = 'public',
    AsOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection, SchemaName> = SupabaseRowOf<Client, Collection, SchemaName>,
    TLocal = TRemote,
>(
    props: SyncedSupabaseProps<Client, Collection, SchemaName, AsOption, TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, AsOption>;
export function syncedSupabase<
    Client extends SupabaseClient<any, any>,
    Collection extends SupabaseCollectionOf<Client, SchemaName> & string,
    SchemaName extends SchemaNameOf<Client> = 'public',
    AsOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection, SchemaName> = SupabaseRowOf<Client, Collection, SchemaName>,
    TLocal = TRemote,
>(
    props:
        | SyncedSupabaseProps<Client, Collection, SchemaName, AsOption, TRemote, TLocal>
        | SyncedSupabasePropsWithSelect<Client, Collection, SchemaName, AsOption, TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, AsOption> {
    props = { ...supabaseConfig, ...props } as any;
    const {
        supabase,
        collection,
        select: selectFn,
        schema,
        filter,
        actions,
        fieldCreatedAt,
        fieldUpdatedAt,
        fieldDeleted,
        realtime,
        changesSince,
        transform: transformParam,
        stringifyDates,
        waitFor,
        waitForSet,
        generateId,
        mode,
        list: listParam,
        create: createParam,
        update: updateParam,
        delete: deleteParam,
        ...rest
    } = props;

    // TODO: This is optional because configureSynced may set it so individual callers don't have to
    // but that's not ideal, maybe there's a better way
    const client = supabase!;

    // If using last-sync mode then put it into soft delete mode
    if (process.env.NODE_ENV === 'development' && changesSince === 'last-sync') {
        if (!fieldCreatedAt) {
            console.warn('[legend-state] fieldCreatedAt is required when using last-sync mode');
        }
        if (!fieldUpdatedAt) {
            console.warn('[legend-state] fieldUpdatedAt is required when using last-sync mode');
        }
        if (!fieldDeleted) {
            console.warn('[legend-state] fieldDeleted is required when using last-sync mode');
        }
    }

    const list =
        !actions || actions.includes('read')
            ? listParam
                ? wrapSupabaseFn(listParam, 'list')
                : async (params: SyncedGetParams<TRemote>) => {
                      const { lastSync, onError } = params;
                      const clientSchema = schema ? client.schema(schema as string) : client;
                      const from = clientSchema.from(collection);
                      let select = selectFn ? selectFn(from) : from.select();

                      // in last-sync mode, filter for rows updated more recently than the last sync
                      if (changesSince === 'last-sync' && lastSync) {
                          const date = new Date(lastSync).toISOString();
                          select = select.gt(fieldUpdatedAt!, date);
                      }
                      // filter with filter parameter
                      if (filter) {
                          select = filter(select, params);
                      }
                      const { data, error } = await select;
                      if (data) {
                          return (data! || []) as SupabaseRowOf<Client, Collection, SchemaName>[];
                      } else if (error) {
                          handleSupabaseError(error, onError, {
                              getParams: params,
                              source: 'list',
                              type: 'get',
                              retry: params,
                          });
                      }
                      return null;
                  }
            : undefined;

    const create = createParam
        ? wrapSupabaseFn(createParam, 'create')
        : !actions || actions.includes('create')
          ? async (input: SupabaseRowOf<Client, Collection, SchemaName>, params: SyncedSetParams<TRemote>) => {
                const { onError } = params;
                const res = await client.from(collection).insert(input).select();
                const { data, error } = res;
                if (data) {
                    const created = data[0];
                    return created;
                } else if (error) {
                    handleSupabaseError(error, onError, {
                        setParams: params,
                        source: 'create',
                        type: 'set',
                        retry: params,
                        input,
                        revert: createRevertChanges(params.value$, params.changes),
                    });
                }
            }
          : undefined;

    const update =
        !actions || actions.includes('update')
            ? updateParam
                ? wrapSupabaseFn(updateParam, 'update')
                : async (input: SupabaseRowOf<Client, Collection, SchemaName>, params: SyncedSetParams<TRemote>) => {
                      const { onError } = params;
                      const res = await client.from(collection).update(input).eq('id', input.id).select();
                      const { data, error } = res;
                      if (data) {
                          const created = data[0];
                          return created;
                      } else if (error) {
                          handleSupabaseError(error, onError, {
                              setParams: params,
                              source: 'update',
                              type: 'set',
                              retry: params,
                              input,
                              revert: createRevertChanges(params.value$, params.changes),
                          });
                      }
                  }
            : undefined;

    const deleteFn =
        !fieldDeleted && (!actions || actions.includes('delete'))
            ? // prettier-ignore
              deleteParam
                ? wrapSupabaseFn(deleteParam, 'delete')
                : (async (
                      input: { id: SupabaseRowOf<Client, Collection, SchemaName>['id'] },
                      params: SyncedSetParams<TRemote>,
                  ) => {
                      const { onError } = params;
                      const id = input.id;
                      const res = await client.from(collection).delete().eq('id', id).select();
                      const { data, error } = res;
                      if (data) {
                          const created = data[0];
                          return created;
                      } else if (error) {
                          handleSupabaseError(error, onError, {
                              setParams: params,
                              source: 'delete',
                              type: 'set',
                              retry: params,
                              input,
                              revert: createRevertChanges(params.value$, params.changes),
                          });
                      }
                  })
            : undefined;

    const subscribe = realtime
        ? ({ node, value$, update }: SyncedSubscribeParams<TRemote[]>) => {
              const { filter, schema } = (isObject(realtime) ? realtime : {}) as { schema?: string; filter?: string };
              const channel = client
                  .channel(`LS_${node.key || ''}${channelNum++}`)
                  .on(
                      'postgres_changes',
                      {
                          event: '*',
                          table: collection,
                          schema: schema || 'public',
                          filter: filter || undefined,
                      },
                      (payload) => {
                          const { eventType, new: value, old } = payload;
                          if (eventType === 'INSERT' || eventType === 'UPDATE') {
                              const cur = value$.peek()?.[value.id];
                              let isOk = !fieldUpdatedAt;
                              let lastSync = undefined;
                              if (!isOk) {
                                  const curDateStr =
                                      cur &&
                                      ((fieldUpdatedAt && cur[fieldUpdatedAt]) ||
                                          fieldCreatedAt ||
                                          cur[fieldCreatedAt as any]);
                                  const valueDateStr =
                                      (fieldUpdatedAt && value[fieldUpdatedAt]) ||
                                      (fieldCreatedAt && value[fieldCreatedAt]);
                                  lastSync = +new Date(valueDateStr);

                                  isOk = valueDateStr && (!curDateStr || lastSync > +new Date(curDateStr));
                              }
                              // Check if new or newer than last seen locally
                              if (isOk) {
                                  // Update local with the new value
                                  update({
                                      value: [value as TRemote],
                                      lastSync,
                                      mode: 'merge',
                                  });
                              }
                          } else if (eventType === 'DELETE') {
                              old[symbolDelete as any] = true;
                              update({
                                  value: [old as TRemote],
                              });
                          }
                      },
                  )
                  .subscribe();

              return () => channel.unsubscribe();
          }
        : undefined;

    let transform = transformParam;
    if (stringifyDates) {
        const stringifier = transformStringifyDates() as SyncTransform<TLocal, TRemote>;
        transform = transform ? combineTransforms(stringifier, transform) : stringifier;
    }

    return syncedCrud<
        SupabaseRowOf<Client, Collection, SchemaName>,
        SupabaseRowOf<Client, Collection, SchemaName>,
        AsOption
    >({
        ...rest,
        mode: mode || 'merge',
        list: list as any,
        create,
        update,
        delete: deleteFn,
        subscribe,
        fieldCreatedAt,
        fieldUpdatedAt,
        fieldDeleted,
        updatePartial: false,
        transform,
        generateId,
        waitFor: () => isEnabled$.get() && (waitFor ? computeSelector(waitFor) : true),
        waitForSet: (params: WaitForSetCrudFnParams<any>) =>
            isEnabled$.get() && (waitForSet ? (isFunction(waitForSet) ? waitForSet(params) : waitForSet) : true),
    });
}
