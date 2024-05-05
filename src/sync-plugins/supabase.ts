import {
    Observable,
    computeSelector,
    getNodeValue,
    mergeIntoObservable,
    observable,
    symbolDelete,
} from '@legendapp/state';
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type SchemaOf<Client extends SupabaseClient> = Client extends SupabaseClient<infer _, infer __, infer Schema>
    ? Schema
    : never;
type TableOf<Client extends SupabaseClient> = SchemaOf<Client>['Tables'];
type CollectionOf<Client extends SupabaseClient> = keyof TableOf<Client>;
type RowOf<Client extends SupabaseClient, Collection extends CollectionOf<Client>> = TableOf<Client>[Collection]['Row'];

export type SyncedSupabaseConfig<T extends { id: string }> = Omit<
    SyncedCrudPropsBase<T>,
    'create' | 'update' | 'delete' | 'onSaved' | 'transform' | 'updatePartial' | 'subscribe'
>;

export interface SyncedSupabaseGlobalConfig
    extends Omit<SyncedSupabaseConfig<{ id: string }>, 'persist' | keyof SyncedOptions> {
    persist?: SyncedOptionsGlobal;
    enabled?: Observable<boolean>;
    as?: Exclude<CrudAsOption, 'first'>;
}

interface SyncedSupabaseProps<
    Client extends SupabaseClient,
    Collection extends CollectionOf<Client>,
    TOption extends CrudAsOption = 'object',
> extends SyncedSupabaseConfig<RowOf<Client, Collection>>,
        SyncedCrudPropsMany<RowOf<Client, Collection>, RowOf<Client, Collection>, TOption> {
    supabase: Client;
    collection: Collection;
    select?: (
        query: PostgrestQueryBuilder<SchemaOf<Client>, TableOf<Client>[Collection], Collection>,
    ) => PostgrestFilterBuilder<
        SchemaOf<Client>,
        RowOf<Client, Collection>,
        RowOf<Client, Collection>[],
        Collection,
        []
    >;
    filter?: (
        select: PostgrestFilterBuilder<
            SchemaOf<Client>,
            RowOf<Client, Collection>,
            RowOf<Client, Collection>[],
            Collection,
            []
        >,
        params: SyncedGetParams,
    ) => PostgrestFilterBuilder<
        SchemaOf<Client>,
        RowOf<Client, Collection>,
        RowOf<Client, Collection>[],
        Collection,
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
    Object.assign(supabaseConfig, removeNullUndefined(rest));
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
                      select = select.neq('deleted', true);
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

    return syncedCrud<RowOf<Client, Collection>, RowOf<Client, Collection>, AsOption>({
        ...rest,
        list,
        create,
        update,
        delete: deleteFn,
        onSaved: (saved) => {
            // Update the local timestamps with server response
            if (fieldCreatedAt || fieldUpdatedAt) {
                const ret: any = {
                    id: saved.id,
                };
                if (fieldCreatedAt) {
                    ret[fieldCreatedAt] = fieldCreatedAt;
                }
                if (fieldUpdatedAt) {
                    ret[fieldUpdatedAt] = fieldUpdatedAt;
                }
                return ret;
            }
        },
        subscribe,
        fieldCreatedAt,
        fieldUpdatedAt,
        updatePartial: true,
        generateId,
        waitFor: () => isEnabled$.get() && (waitFor ? computeSelector(waitFor) : true),
        waitForSet,
    });
}
