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
    notifyManager,
} from '@tanstack/query-core';

let nextMutationKey = 0;

export interface ObservableQueryOptions<TQueryFnData, TError, TData, TQueryKey extends QueryKey>
    extends Omit<QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>, 'queryKey'> {
    queryKey?: TQueryKey | (() => TQueryKey);
}

export interface SyncedQueryParams<TQueryFnData, TError, TData, TQueryKey extends QueryKey>
    extends Omit<SyncedOptions<TData>, 'get' | 'set' | 'retry'> {
    queryClient: QueryClient;
    query: ObservableQueryOptions<TQueryFnData, TError, TData, TQueryKey>;
    mutation?: MutationObserverOptions<TQueryFnData, TError, TData>;
}

export function syncedQuery<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
>(params: SyncedQueryParams<TQueryFnData, TError, TData, TQueryKey>): Synced<TData> {
    const { query: options, mutation: mutationOptions, queryClient, initial: initialParam, ...rest } = params;

    let initial: TData | undefined;
    if (initialParam !== undefined) {
        initial = isFunction(initialParam) ? initialParam() : initialParam;
    }

    const Observer = QueryObserver;
    let observer: QueryObserver<TQueryFnData, TError, TData, TQueryFnData, TQueryKey> | undefined = undefined;
    let latestOptions!: DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>;
    let queryKeyFromFn: TQueryKey;
    let resolveInitialPromise: undefined | ((value: TData) => void) = undefined;

    const origQueryKey = options.queryKey!;

    // If the queryKey is a function, observe it and extract the raw value
    const isKeyFunction = isFunction(origQueryKey);

    const updateQueryOptions = () => {
        // Query options must be new for the observer to see a changed key.
        const queryOptions = Object.assign({}, options);
        if (isKeyFunction) {
            queryOptions.queryKey = queryKeyFromFn;
        }
        const defaultedOptions = queryClient.defaultQueryOptions(
            queryOptions as QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
        );
        if (initialParam !== undefined && !defaultedOptions.select) {
            defaultedOptions.initialData = initial as any;
        }
        latestOptions = defaultedOptions;
        if (observer) {
            observer.setOptions(latestOptions, { listeners: false });
        }
    };

    if (isKeyFunction) {
        observe(() => {
            queryKeyFromFn = origQueryKey();
            updateQueryOptions();
        });
    } else {
        updateQueryOptions();
    }

    // Create the observer
    observer = new Observer!<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(queryClient!, latestOptions);
    if (initialParam === undefined) {
        initial = observer.getOptimisticResult(latestOptions).data;
    }

    let isFirstRun = true;
    const get = (async () => {
        if (isFirstRun) {
            isFirstRun = false;

            // Get the initial optimistic results if it's already cached
            const result = observer!.getOptimisticResult(latestOptions);

            if (result.isLoading) {
                await new Promise((resolve) => {
                    resolveInitialPromise = resolve;
                });
            }

            return result.data!;
        } else {
            return Promise.resolve(observer!.refetch()).then((res) => (res as any).data as TData);
        }
    }) as () => Promise<TData>;

    const subscribe = ({ update }: SyncedSubscribeParams<TData>) => {
        // Subscribe to Query's observer and update the observable
        const unsubscribe = observer!.subscribe(
            notifyManager.batchCalls((result) => {
                if (result.status === 'success') {
                    if (resolveInitialPromise) {
                        resolveInitialPromise(result.data);
                        resolveInitialPromise = undefined;
                    }
                    update({ value: result.data });
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
