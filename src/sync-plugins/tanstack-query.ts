import { isFunction, observe } from '@legendapp/state';
import { Synced, SyncedOptions, SyncedSetParams, SyncedSubscribeParams, synced } from '@legendapp/state/sync';
import {
    DefaultError,
    DefaultedQueryObserverOptions,
    MutationObserver,
    MutationObserverOptions,
    QueryClient,
    QueryKey,
    QueryObserver,
    QueryObserverOptions,
    QueryObserverResult,
    notifyManager,
} from '@tanstack/query-core';

let nextMutationKey = 0;

export interface ObservableQueryOptions<TQueryFnData, TError, TData, TQueryKey extends QueryKey>
    extends Omit<QueryObserverOptions<TQueryFnData, TError, TData, TData, TQueryKey>, 'queryKey'> {
    queryKey?: TQueryKey | (() => TQueryKey);
}

export interface QueryState<TError = DefaultError> {
    isLoading: boolean;
    isFetching: boolean;
    error: TError | null;
    status: 'pending' | 'error' | 'success';
    fetchStatus: 'fetching' | 'paused' | 'idle';
}

export interface SyncedQueryParams<TQueryFnData, TError, TData, TQueryKey extends QueryKey>
    extends Omit<SyncedOptions<TData>, 'get' | 'set' | 'retry'> {
    queryClient: QueryClient;
    query: ObservableQueryOptions<TQueryFnData, TError, TData, TQueryKey>;
    mutation?: MutationObserverOptions<TQueryFnData, TError, TData>;
    onQueryStateChange?: (state: QueryState<TError>) => void;
}

export function syncedQuery<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
>(params: SyncedQueryParams<TQueryFnData, TError, TData, TQueryKey>): Synced<TData> {
    const {
        query: options,
        mutation: mutationOptions,
        queryClient,
        initial: initialParam,
        onQueryStateChange,
        ...rest
    } = params;

    if (initialParam !== undefined) {
        const initialValue = isFunction(initialParam) ? initialParam() : initialParam;
        options.initialData = initialValue as any;
    }

    const initial = options.initialData as TData;

    const Observer = QueryObserver;
    const defaultedOptions = queryClient!.defaultQueryOptions(
        options as QueryObserverOptions<TQueryFnData, TError, TData, TQueryKey>,
    );
    let observer: QueryObserver<TQueryFnData, TError, TData, TQueryKey> | undefined = undefined;
    let latestOptions = defaultedOptions;
    let queryKeyFromFn: TQueryKey;
    let resolveInitialPromise: undefined | ((value: TData) => void) = undefined;

    const origQueryKey = options.queryKey!;

    // If the queryKey is a function, observe it and extract the raw value
    const isKeyFunction = isFunction(origQueryKey);

    const updateQueryOptions = (obj: DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey>) => {
        // Since legend-state mutates the query options, we need to clone it to make Query
        // see it as changed
        const options = Object.assign({}, obj);

        // Use the latest value from the observed queryKey function
        if (isKeyFunction) {
            options.queryKey = queryKeyFromFn;
        }

        latestOptions = options;

        // Update the Query options
        if (observer) {
            observer.setOptions(options, { listeners: false });
        }
    };

    if (isKeyFunction) {
        observe(() => {
            queryKeyFromFn = origQueryKey();
            updateQueryOptions(latestOptions);
        });
    }

    // Create the observer
    observer = new Observer!<TQueryFnData, TError, TData, TQueryKey>(queryClient!, latestOptions);

    let isFirstRun = true;
    let rejectInitialPromise: undefined | ((error: Error) => void) = undefined;
    const get = (async () => {
        if (isFirstRun) {
            isFirstRun = false;

            // Get the initial optimistic results if it's already cached
            const result = observer!.getOptimisticResult(latestOptions);

            if (result.isLoading) {
                return await new Promise<TData>((resolve, reject) => {
                    resolveInitialPromise = resolve;
                    rejectInitialPromise = reject;
                });
            }

            return result.data!;
        } else {
            // Subsequent calls (including sync()) always refetch from the server.
            // TQ observer handles refetchOnMount/staleTime/etc. internally via subscription.
            return Promise.resolve(observer!.refetch()).then((res) => (res as any).data as TData);
        }
    }) as () => Promise<TData>;

    const emitQueryState = (result: QueryObserverResult<TData, TError>) => {
        if (onQueryStateChange) {
            onQueryStateChange({
                isLoading: result.isLoading,
                isFetching: result.isFetching,
                error: result.error,
                status: result.status,
                fetchStatus: result.fetchStatus,
            });
        }
    };

    const subscribe = ({ update, onError, node }: SyncedSubscribeParams<TData>) => {
        // Subscribe to Query's observer and update the observable
        const unsubscribe = observer!.subscribe(
            notifyManager.batchCalls((result: QueryObserverResult<TData, TError>) => {
                emitQueryState(result);

                if (result.status === 'success') {
                    // Clear error on success
                    if (node.state && node.state.error.peek()) {
                        node.state.error.set(undefined);
                    }
                    if (resolveInitialPromise) {
                        resolveInitialPromise(result.data);
                        resolveInitialPromise = undefined;
                        rejectInitialPromise = undefined;
                    }
                    update({ value: result.data });
                } else if (result.status === 'error') {
                    // Propagate error to syncState via onError
                    if (rejectInitialPromise) {
                        rejectInitialPromise(result.error as Error);
                        rejectInitialPromise = undefined;
                        resolveInitialPromise = undefined;
                    }
                    onError(result.error as Error);
                }
            }),
        );

        // Update result to make sure we did not miss any query updates
        // between creating the observer and subscribing to it.
        observer.updateResult();

        return unsubscribe;
    };

    let set: undefined | (({ value }: SyncedSetParams<any>) => Promise<TData>) = undefined;
    if (mutationOptions) {
        const options: MutationObserverOptions<TQueryFnData, TError, TData> = {
            mutationKey: ['LS-mutation', nextMutationKey++],
            ...mutationOptions,
        };
        const mutator = new MutationObserver(queryClient!, options);
        set = ({ value }: SyncedSetParams<TData>) => {
            const mutationCache = queryClient.getMutationCache();

            // Ensure only the last update is sent by clearing any previous mutations
            mutationCache.findAll({ mutationKey: options.mutationKey }).forEach((mutation) => {
                mutationCache.remove(mutation);
            });

            return mutator.mutate(value as any) as any;
        };
    }

    return synced({
        get,
        set,
        subscribe,
        initial,
        ...rest,
    });
}
