import {
    Observable,
    SyncedOptionsGlobal,
    computeSelector,
    getNodeValue,
    mergeIntoObservable,
    observable,
    symbolDelete,
    type SyncedGetParams,
    type SyncedSubscribeParams,
} from '@legendapp/state';
import {
    CrudAsOption,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudReturnType,
    syncedCrud,
} from '@legendapp/state/sync-plugins/crud';
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Unused types but maybe useful in the future so keeping them for now
// type DatabaseOf<TClient extends SupabaseClient> = TClient extends SupabaseClient<infer TDB> ? TDB : never;
// type SchemaNameOf<TClient extends SupabaseClient> = TClient extends SupabaseClient<infer _, infer TSchemaName>
//     ? TSchemaName
//     : never;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type SchemaOf<TClient extends SupabaseClient> = TClient extends SupabaseClient<infer _, infer __, infer TSchema>
    ? TSchema
    : never;
type TableOf<TClient extends SupabaseClient> = SchemaOf<TClient>['Tables'];
type CollectionOf<TClient extends SupabaseClient> = keyof TableOf<TClient>;
type RowOf<
    TClient extends SupabaseClient,
    TCollection extends CollectionOf<TClient>,
> = TableOf<TClient>[TCollection]['Row'];

export type SyncedSupabaseConfig<T extends { id: string }> = Omit<
    SyncedCrudPropsBase<T>,
    'create' | 'update' | 'delete' | 'onSaved' | 'transform' | 'fieldCreatedAt' | 'updatePartial' | 'subscribe'
>;

export interface SyncedSupabaseGlobalConfig extends Omit<SyncedSupabaseConfig<{ id: string }>, 'persist'> {
    persist?: SyncedOptionsGlobal;
    enabled?: Observable<boolean>;
}

interface SyncedSupabaseProps<
    TClient extends SupabaseClient,
    TCollection extends CollectionOf<TClient>,
    TOption extends CrudAsOption = 'object',
> extends SyncedSupabaseConfig<RowOf<TClient, TCollection>>,
        SyncedCrudPropsMany<RowOf<TClient, TCollection>, RowOf<TClient, TCollection>, TOption> {
    supabase: TClient;
    collection: TCollection;
    filter?: (
        select: PostgrestFilterBuilder<
            SchemaOf<TClient>,
            RowOf<TClient, TCollection>,
            RowOf<TClient, TCollection>[],
            TCollection,
            []
        >,
        params: SyncedGetParams,
    ) => PostgrestFilterBuilder<
        SchemaOf<TClient>,
        RowOf<TClient, TCollection>,
        RowOf<TClient, TCollection>[],
        TCollection,
        []
    >;
    actions?: ('create' | 'read' | 'update' | 'delete')[];
    realtime?: { schema?: string; filter?: string };
}

let channelNum = 1;
const supabaseConfig: SyncedSupabaseGlobalConfig = {};
const isEnabled$ = observable(true);

export function configureSyncedSupabase(config: SyncedSupabaseGlobalConfig) {
    const { enabled, ...rest } = config;
    if (enabled !== undefined) {
        isEnabled$.set(enabled);
    }
    Object.assign(supabaseConfig, rest);
}

export function syncedSupabase<
    Client extends SupabaseClient,
    Collection extends CollectionOf<Client> & string,
    AsOption extends CrudAsOption = 'object',
>(props: SyncedSupabaseProps<Client, Collection, AsOption>): SyncedCrudReturnType<RowOf<Client, Collection>, AsOption> {
    mergeIntoObservable(props, supabaseConfig);
    const {
        supabase: client,
        collection,
        filter,
        actions,
        fieldUpdatedAt,
        realtime,
        changesSince,
        waitFor,
        waitForSet,
        ...rest
    } = props;
    const list =
        !actions || actions.includes('read')
            ? async (params: SyncedGetParams) => {
                  const { lastSync } = params;
                  let select = client.from(collection).select();
                  if (changesSince === 'last-sync') {
                      select = select.neq('deleted', true);
                      if (lastSync) {
                          const date = new Date(lastSync).toISOString();
                          select = select.or(
                              `created_at.gt.${date}${fieldUpdatedAt ? `,${fieldUpdatedAt}.gt.${date}` : ''}`,
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
                  return (data! || []) as RowOf<Client, Collection>[];
              }
            : undefined;

    const upsert = async (input: RowOf<Client, Collection>) => {
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
            ? async (input: RowOf<Client, Collection>) => {
                  const id = input.id;
                  const from = client.from(collection);
                  const res = await (changesSince === 'last-sync' ? from.update({ deleted: true }) : from.delete())
                      .eq('id', id)
                      .select();
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
        ? ({ node, update }: SyncedSubscribeParams) => {
              const { filter, schema } = realtime;
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
                              const cur = getNodeValue(node)?.[value.id];
                              const curDateStr = cur && (cur.updated_at || cur.created_at);
                              const valueDateStr = value.updated_at || value.created_at;
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

    return syncedCrud<RowOf<Client, Collection>, RowOf<Client, Collection>, AsOption>({
        ...rest,
        list,
        create,
        update,
        delete: deleteFn,
        onSaved: (saved) => {
            // Update the local timestamps with server response
            return {
                id: saved.id,
                created_at: saved.created_at,
                updated_at: saved.updated_at,
            };
        },
        subscribe,
        fieldCreatedAt: 'created_at',
        fieldUpdatedAt,
        updatePartial: true,
        waitFor: () => isEnabled$.get() && (waitFor ? computeSelector(waitFor) : true),
        waitForSet: () => isEnabled$.get() && (waitForSet ? computeSelector(waitForSet) : true),
    });
}
