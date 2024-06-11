import { useObservable } from '@legendapp/state/react';
import { SyncedQueryParams, syncedQuery } from '@legendapp/state/sync-plugins/tanstack-query';
import { DefaultError, QueryKey } from '@tanstack/query-core';
import type { Observable } from '@legendapp/state';
import type { Synced } from '@legendapp/state/sync';

export function useObservableSyncedQuery<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
>(params: SyncedQueryParams<TQueryFnData, TError, TData, TQueryKey>): Observable<Synced<TData>> {
    return useObservable(syncedQuery(params));
}
