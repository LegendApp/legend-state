import { Observable, computeSelector, isObject, mergeIntoObservable, observable, symbolDelete } from '@legendapp/state';
import {
    SyncedOptions,
    SyncedOptionsGlobal,
    removeNullUndefined,
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

export type SupabaseSchemaOf<Client extends SupabaseClient> = Client extends SupabaseClient<
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

export type SyncedSupabaseConfig<T extends { id: string }> = Omit<
    SyncedCrudPropsBase<T>,
    'create' | 'update' | 'delete'
>;

export interface SyncedSupabaseConfiguration
    extends Omit<SyncedSupabaseConfig<{ id: string }>, 'persist' | keyof SyncedOptions> {
    persist?: SyncedOptionsGlobal;
    enabled?: Observable<boolean>;
    as?: Exclude<CrudAsOption, 'first'>;
}

interface SyncedSupabaseProps<
    Client extends SupabaseClient,
    Collection extends SupabaseCollectionOf<Client>,
    TOption extends CrudAsOption = 'object',
> extends SyncedSupabaseConfig<SupabaseRowOf<Client, Collection>>,
        SyncedCrudPropsMany<SupabaseRowOf<Client, Collection>, SupabaseRowOf<Client, Collection>, TOption> {
    supabase: Client;
    collection: Collection;
    select?: (
        query: PostgrestQueryBuilder<SupabaseSchemaOf<Client>, SupabaseTableOf<Client>[Collection], Collection>,
    ) => PostgrestFilterBuilder<
        SupabaseSchemaOf<Client>,
        SupabaseRowOf<Client, Collection>,
        SupabaseRowOf<Client, Collection>[],
        Collection,
        []
    >;
    filter?: (
        select: PostgrestFilterBuilder<
            SupabaseSchemaOf<Client>,
            SupabaseRowOf<Client, Collection>,
            SupabaseRowOf<Client, Collection>[],
            Collection,
            []
        >,
        params: SyncedGetParams,
    ) => PostgrestFilterBuilder<
        SupabaseSchemaOf<Client>,
        SupabaseRowOf<Client, Collection>,
        SupabaseRowOf<Client, Collection>[],
        Collection,
        []
    >;
    actions?: ('create' | 'read' | 'update' | 'delete')[];
    realtime?: boolean | { schema?: string; filter?: string };
}

let channelNum = 1;
const supabaseConfig: SyncedSupabaseConfiguration = {};
const isEnabled$ = observable(true);

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
>(
    props: SyncedSupabaseProps<Client, Collection, AsOption>,
): SyncedCrudReturnType<SupabaseRowOf<Client, Collection>, AsOption> {
    mergeIntoObservable(props, supabaseConfig);
    const {
        supabase: client,
        collection,
        select: selectFn,
        filter,
        actions,
        fieldCreatedAt,
        fieldUpdatedAt,
        realtime,
        changesSince,
        waitFor,
        waitForSet,
        generateId: generateIdParam,
        ...rest
    } = props;

    const generateId = generateIdParam || supabaseConfig.generateId;

    const list =
        !actions || actions.includes('read')
            ? async (params: SyncedGetParams) => {
                  const { lastSync } = params;
                  const from = client.from(collection);
                  let select = selectFn ? selectFn(from) : from.select();
                  if (changesSince === 'last-sync') {
                      if (lastSync) {
                          const date = new Date(lastSync).toISOString();
                          select = select.or(
                              [
                                  fieldCreatedAt && `${fieldCreatedAt}.gt.${date}`,
                                  fieldUpdatedAt && `${fieldUpdatedAt}.gt.${date}`,
                              ].join(','),
                          );
                      }
                  }
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
        !actions || actions.includes('delete')
            ? async (input: { id: SupabaseRowOf<Client, Collection>['id'] }) => {
                  const id = input.id;
                  const from = client.from(collection);
                  const res = await from.delete().eq('id', id).select();
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
        ? ({ node, value$, update }: SyncedSubscribeParams) => {
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
                                      value: { [value.id]: value },
                                      lastSync: valueDate,
                                      mode: 'merge',
                                  });
                              }
                          } else if (eventType === 'DELETE') {
                              const { id } = old;
                              update({
                                  value: { [id]: symbolDelete },
                              });
                          }
                      },
                  )
                  .subscribe();

              return channel.unsubscribe;
          }
        : undefined;

    return syncedCrud<SupabaseRowOf<Client, Collection>, SupabaseRowOf<Client, Collection>, AsOption>({
        ...rest,
        list,
        create,
        update,
        delete: deleteFn,
        subscribe,
        fieldCreatedAt,
        fieldUpdatedAt,
        updatePartial: false,
        generateId,
        waitFor: () => isEnabled$.get() && (waitFor ? computeSelector(waitFor) : true),
        waitForSet,
    });
}
