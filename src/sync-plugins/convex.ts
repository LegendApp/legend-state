import type { SyncedGetParams, SyncedSubscribeParams } from '@legendapp/state/sync';
import type {
    CrudAsOption,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudReturnType,
} from '@legendapp/state/sync-plugins/crud';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';

import type { ConvexClient } from 'convex/browser';
import type { ConvexReactClient } from 'convex/react';
import type { FunctionArgs, FunctionReference } from 'convex/server';

interface SyncedConvexProps<
    Client extends ConvexClient | ConvexReactClient,
    Query extends FunctionReference<'query', 'public', Record<string, unknown>, TRemote[]>,
    TOption extends CrudAsOption = 'object',
    TRemote extends { _id: string } = Query['_returnType'][number],
> extends Omit<SyncedCrudPropsMany<TRemote, TRemote, TOption>, 'list' | 'subscribe'>,
        Omit<
            SyncedCrudPropsBase<TRemote, TRemote>,
            'create' | 'update' | 'delete' | 'fieldCreatedAt' | 'fieldId' | 'list' | 'subscribe'
        > {
    convex: Client;
    query: Query;
    queryArgs?: FunctionArgs<Query>;
    create?: FunctionReference<'mutation', 'public', NoInfer<Partial<TRemote>>>;
    update?: FunctionReference<'mutation', 'public', NoInfer<Partial<TRemote>>>;
    delete?: FunctionReference<'mutation', 'public', NoInfer<Partial<TRemote>>>;
    realtime?: boolean;
}

export function syncedConvex<
    Client extends ConvexClient | ConvexReactClient,
    Query extends FunctionReference<'query', 'public', Record<string, unknown>, TRemote[]>,
    TOption extends CrudAsOption = 'object',
    TRemote extends { _id: string } = Query['_returnType'][number],
>(props: SyncedConvexProps<Client, Query, TOption, TRemote>): SyncedCrudReturnType<TRemote, TOption> {
    const {
        convex,
        query,
        queryArgs = {},
        create: createParam,
        update: updateParam,
        delete: deleteParam,
        realtime,
        // changesSince,
        generateId,
        mode,
        ...rest
    } = props;

    // If using last-sync mode then put it into soft delete mode
    //   const fieldUpdatedAt =
    //     fieldUpdatedAtParam ||
    //     (changesSince === "last-sync" ? "updated_at" : undefined);
    //   const fieldDeleted =
    //     fieldDeletedParam || (changesSince === "last-sync" ? "deleted" : undefined);

    const subscribe =
        realtime === false
            ? undefined
            : (params: SyncedSubscribeParams<TRemote[]>) => {
                  try {
                      if ((convex as ConvexReactClient).watchQuery) {
                          const convexReactClient = convex as ConvexReactClient;
                          const watch = convexReactClient.watchQuery(query, queryArgs || {});
                          watch.onUpdate(() => {
                              try {
                                  const value = watch.localQueryResult() as TRemote[];
                                  params.update({ value });
                              } catch (error) {
                                  params.onError(error as Error);
                              }
                          });
                      } else {
                          (convex as ConvexClient)?.onUpdate(query, queryArgs, (result: unknown) => {
                              try {
                                  const value = result as TRemote[];
                                  params.update({ value });
                              } catch (error) {
                                  params.onError(error as Error);
                              }
                          });
                      }
                  } catch (error) {
                      params.onError(error as Error);
                  }
              };

    const list = async (_params: SyncedGetParams<TRemote>) => {
        const results = (await convex.query(query, queryArgs || {})) as TRemote[];
        return results;
    };

    const create = createParam ? (input: TRemote, _params?: unknown) => convex.mutation(createParam, input) : undefined;
    const update = updateParam
        ? (input: Partial<TRemote>, _params?: unknown) => convex.mutation(updateParam, input)
        : undefined;
    const deleteFn = deleteParam
        ? (input: TRemote, _params?: unknown) => convex.mutation(deleteParam, input)
        : undefined;

    return syncedCrud({
        ...rest,
        mode: mode || 'merge',
        list,
        create,
        update,
        delete: deleteFn,
        fieldCreatedAt: '_creationTime',
        // fieldUpdatedAt,
        // fieldDeleted,
        updatePartial: false,
        fieldId: '_id',
        subscribe,
        generateId,
    });
}
