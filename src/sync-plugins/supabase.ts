import {
    Observable,
    WaitForSetFnParams,
    computeSelector,
    isFunction,
    isObject,
    observable,
    symbolDelete,
} from '@legendapp/state';
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
    syncedCrud,
} from '@legendapp/state/sync-plugins/crud';
import type { PostgrestFilterBuilder, PostgrestQueryBuilder } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';
// Unused types but maybe useful in the future so keeping them for now
// type DatabaseOf<Client extends SupabaseClient> = Client extends SupabaseClient<infer TDB> ? TDB : never;
// type SchemaNameOf<Client extends SupabaseClient> = Client extends SupabaseClient<infer _, infer SchemaName>
//     ? SchemaName
//     : never;

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
export type SupabaseTableOf<Client extends SupabaseClient> = SupabaseSchemaOf<Client>['Tables'];
export type SupabaseCollectionOf<Client extends SupabaseClient> = keyof SupabaseTableOf<Client>;
export type SupabaseRowOf<
    Client extends SupabaseClient,
    Collection extends SupabaseCollectionOf<Client>,
> = SupabaseTableOf<Client>[Collection]['Row'];

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
    Client extends SupabaseClient,
    Collection extends SupabaseCollectionOf<Client>,
    TOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection> = SupabaseRowOf<Client, Collection>,
    TLocal = TRemote,
> extends SyncedSupabaseConfig<TRemote, TLocal>,
        SyncedCrudPropsMany<TRemote, TRemote, TOption> {
    supabase: Client;
    collection: Collection;
    select?: (
        query: PostgrestQueryBuilder<SupabaseSchemaOf<Client>, SupabaseTableOf<Client>[Collection], Collection>,
    ) => PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>;
    filter?: (
        select: PostgrestFilterBuilder<SupabaseSchemaOf<Client>, TRemote, TRemote[], Collection, []>,
        params: SyncedGetParams,
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
    Client extends SupabaseClient,
    Collection extends SupabaseCollectionOf<Client> & string,
    AsOption extends CrudAsOption = 'object',
    TRemote extends SupabaseRowOf<Client, Collection> = SupabaseRowOf<Client, Collection>,
    TLocal = TRemote,
>(props: SyncedSupabaseProps<Client, Collection, AsOption, TRemote, TLocal>): SyncedCrudReturnType<TLocal, AsOption> {
    props = { ...supabaseConfig, ...props } as any;
    const {
        supabase: client,
        collection,
        select: selectFn,
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
            ? async (params: SyncedGetParams) => {
                  const { lastSync } = params;
                  const from = client.from(collection);
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
                  return (data! || []) as SupabaseRowOf<Client, Collection>[];
              }
            : undefined;

    const upsert = async (input: SupabaseRowOf<Client, Collection>) => {
        const res = await client.from(collection).upsert(input).select();
        const { data, error } = res;
        if (data) {
            const created = data[0];
            return created;
        } else {
            throw new Error(error?.message);
        }
    };
    const create = !actions || actions.includes('create') ? upsert : undefined;
    const update = !actions || actions.includes('update') ? upsert : undefined;
    const deleteFn =
        !fieldDeleted && (!actions || actions.includes('delete'))
            ? async (input: { id: SupabaseRowOf<Client, Collection>['id'] }) => {
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
                              const { id } = old;
                              update({
                                  value: [{ [id]: symbolDelete } as TRemote],
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

    return syncedCrud<SupabaseRowOf<Client, Collection>, SupabaseRowOf<Client, Collection>, AsOption>({
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
        waitForSet: (params: WaitForSetFnParams<any>) =>
            isEnabled$.get() && (waitForSet ? (isFunction(waitForSet) ? waitForSet(params) : waitForSet) : true),
    });
}
