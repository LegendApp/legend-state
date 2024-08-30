import { Observable, computeSelector, isFunction, isObject, observable, symbolDelete } from '@legendapp/state';
import {
    SyncTransform,
    SyncedOptions,
    SyncedOptionsGlobal,
    combineTransforms,
    removeNullUndefined,
    transformStringifyDates,
    type SyncedGetParams,
    type SyncedSubscribeParams,
} from '@legendapp/state/sync';
import {
    CrudAsOption,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudReturnType,
    WaitForSetCrudFnParams,
    syncedCrud,
} from '@legendapp/state/sync-plugins/crud';
import type { PostgrestFilterBuilder, PostgrestQueryBuilder } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';
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
    SchemaName extends SchemaNameOf<Client>,
    TOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection, SchemaName> = SupabaseRowOf<Client, Collection, SchemaName>,
    TLocal = TRemote,
> extends SyncedSupabaseConfig<TRemote, TLocal>,
        SyncedCrudPropsMany<TRemote, TRemote, TOption> {
    supabase: Client;
    collection: Collection;
    schema?: SchemaName;
    select?: (
        query: PostgrestQueryBuilder<
            SupabaseSchemaOf<Client>,
            SupabaseTableOf<Client, SchemaName>[Collection],
            Collection
        >,
    ) => PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>;
    filter?: (
        select: PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>,
        params: SyncedGetParams<TRemote>,
    ) => PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>;
    actions?: ('create' | 'read' | 'update' | 'delete')[];
    realtime?: boolean | { schema?: string; filter?: string };
    stringifyDates?: boolean;
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

export function syncedSupabase<
    Client extends SupabaseClient<any, any>,
    Collection extends SupabaseCollectionOf<Client, SchemaName> & string,
    SchemaName extends SchemaNameOf<Client>,
    AsOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection, SchemaName> = SupabaseRowOf<Client, Collection, SchemaName>,
    TLocal = TRemote,
>(
    props: SyncedSupabaseProps<Client, Collection, SchemaName, AsOption, TRemote, TLocal>,
): SyncedCrudReturnType<TLocal, AsOption> {
    props = { ...supabaseConfig, ...props } as any;
    const {
        supabase: client,
        collection,
        select: selectFn,
        schema,
        filter,
        actions,
        fieldCreatedAt: fieldCreatedAtParam,
        fieldUpdatedAt: fieldUpdatedAtParam,
        fieldDeleted: fieldDeletedParam,
        realtime,
        changesSince,
        transform: transformParam,
        stringifyDates,
        waitFor,
        waitForSet,
        generateId,
        mode,
        ...rest
    } = props;

    // If using last-sync mode then put it into soft delete mode
    const fieldCreatedAt = fieldCreatedAtParam || (changesSince === 'last-sync' ? 'created_at' : undefined);
    const fieldUpdatedAt = fieldUpdatedAtParam || (changesSince === 'last-sync' ? 'updated_at' : undefined);
    const fieldDeleted = fieldDeletedParam || (changesSince === 'last-sync' ? 'deleted' : undefined);

    const list =
        !actions || actions.includes('read')
            ? async (params: SyncedGetParams<TRemote>) => {
                  const { lastSync } = params;
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
                  if (error) {
                      throw new Error(error?.message);
                  }
                  return (data! || []) as SupabaseRowOf<Client, Collection, SchemaName>[];
              }
            : undefined;

    const create =
        !actions || actions.includes('create')
            ? async (input: SupabaseRowOf<Client, Collection, SchemaName>) => {
                  const res = await client.from(collection).insert(input).select();
                  const { data, error } = res;
                  if (data) {
                      const created = data[0];
                      return created;
                  } else {
                      throw new Error(error?.message);
                  }
              }
            : undefined;

    const update =
        !actions || actions.includes('update')
            ? async (input: SupabaseRowOf<Client, Collection, SchemaName>) => {
                  const res = await client.from(collection).update(input).eq('id', input.id).select();
                  const { data, error } = res;
                  if (data) {
                      const created = data[0];
                      return created;
                  } else {
                      throw new Error(error?.message);
                  }
              }
            : undefined;

    const deleteFn =
        !fieldDeleted && (!actions || actions.includes('delete'))
            ? async (input: { id: SupabaseRowOf<Client, Collection, SchemaName>['id'] }) => {
                  const id = input.id;
                  const res = await client.from(collection).delete().eq('id', id).select();
                  const { data, error } = res;
                  if (data) {
                      const created = data[0];
                      return created;
                  } else {
                      throw new Error(error?.message);
                  }
              }
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
                              const curDateStr =
                                  cur &&
                                  ((fieldUpdatedAt && cur[fieldUpdatedAt]) ||
                                      fieldCreatedAt ||
                                      cur[fieldCreatedAt as any]);
                              const valueDateStr =
                                  (fieldUpdatedAt && value[fieldUpdatedAt]) ||
                                  (fieldCreatedAt && value[fieldCreatedAt]);
                              const valueDate = +new Date(valueDateStr);
                              // Check if new or newer than last seen locally
                              if (valueDateStr && (!curDateStr || valueDate > +new Date(curDateStr))) {
                                  // Update local with the new value
                                  update({
                                      value: [value as TRemote],
                                      lastSync: valueDate,
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

              return channel.unsubscribe;
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
        list,
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
