// This is basically just React Query's useBaseQuery with a few changes for Legend-State:
// 1. Remove the useSyncExternalStore
// 2. Return an observable that subscribes to the query observer
// 3. If there is a mutator observe the observable for changes and call mutate

import { observable, observe } from '@legendapp/state';
import { useUnmount } from '@legendapp/state/react';
import {
    DefaultedQueryObserverOptions,
    notifyManager,
    Query,
    QueryKey,
    QueryObserver,
    QueryObserverResult,
    UseErrorBoundary,
} from '@tanstack/query-core';
import {
    UseBaseQueryOptions,
    useIsRestoring,
    useMutation,
    UseMutationOptions,
    UseMutationResult,
    useQueryClient,
    useQueryErrorResetBoundary,
} from '@tanstack/react-query';
import type { QueryErrorResetBoundaryValue } from '@tanstack/react-query/build/lib/QueryErrorResetBoundary';
import * as React from 'react';

const ensurePreventErrorBoundaryRetry = <TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(
    options: DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
    errorResetBoundary: QueryErrorResetBoundaryValue
) => {
    if (options.suspense || options.useErrorBoundary) {
        // Prevent retrying failed query if the error boundary has not been reset yet
        if (!errorResetBoundary.isReset()) {
            options.retryOnMount = false;
        }
    }
};

const useClearResetErrorBoundary = (errorResetBoundary: QueryErrorResetBoundaryValue) => {
    React.useEffect(() => {
        errorResetBoundary.clearReset();
    }, [errorResetBoundary]);
};

function shouldThrowError<T extends (...args: any[]) => boolean>(
    _useErrorBoundary: boolean | T | undefined,
    params: Parameters<T>
): boolean {
    // Allow useErrorBoundary function to override throwing behavior on a per-error basis
    if (typeof _useErrorBoundary === 'function') {
        return _useErrorBoundary(...params);
    }

    return !!_useErrorBoundary;
}

const getHasError = <TData, TError, TQueryFnData, TQueryData, TQueryKey extends QueryKey>({
    result,
    errorResetBoundary,
    useErrorBoundary,
    query,
}: {
    result: QueryObserverResult<TData, TError>;
    errorResetBoundary: QueryErrorResetBoundaryValue;
    useErrorBoundary: UseErrorBoundary<TQueryFnData, TError, TQueryData, TQueryKey>;
    query: Query<TQueryFnData, TError, TQueryData, TQueryKey>;
}) => {
    return (
        result.isError &&
        !errorResetBoundary.isReset() &&
        !result.isFetching &&
        shouldThrowError(useErrorBoundary, [result.error, query])
    );
};

export function useObservableQuery<TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey, TContext>(
    options: UseBaseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
    mutationOptions?: UseMutationOptions<TData, TError, void, TContext>
) {
    const Observer = QueryObserver;
    const queryClient = useQueryClient({ context: options.context });
    const isRestoring = useIsRestoring();
    const errorResetBoundary = useQueryErrorResetBoundary();
    const defaultedOptions = queryClient.defaultQueryOptions(options);

    // Make sure results are optimistically set in fetching state before subscribing or updating options
    defaultedOptions._optimisticResults = isRestoring ? 'isRestoring' : 'optimistic';

    // Include callbacks in batch renders
    if (defaultedOptions.onError) {
        defaultedOptions.onError = notifyManager.batchCalls(defaultedOptions.onError);
    }

    if (defaultedOptions.onSuccess) {
        defaultedOptions.onSuccess = notifyManager.batchCalls(defaultedOptions.onSuccess);
    }

    if (defaultedOptions.onSettled) {
        defaultedOptions.onSettled = notifyManager.batchCalls(defaultedOptions.onSettled);
    }

    if (defaultedOptions.suspense) {
        // Always set stale time when using suspense to prevent
        // fetching again when directly mounting after suspending
        if (typeof defaultedOptions.staleTime !== 'number') {
            defaultedOptions.staleTime = 1000;
        }
    }

    ensurePreventErrorBoundaryRetry(defaultedOptions, errorResetBoundary);

    useClearResetErrorBoundary(errorResetBoundary);

    const [observer] = React.useState(
        () => new Observer<TQueryFnData, TError, TData, TQueryData, TQueryKey>(queryClient, defaultedOptions)
    );

    const result = observer.getOptimisticResult(defaultedOptions);

    // useSyncExternalStore was here in useBaseQuery but is removed for Legend-State.

    React.useEffect(() => {
        // Do not notify on updates because of changes in the options because
        // these changes should already be reflected in the optimistic result.
        observer.setOptions(defaultedOptions, { listeners: false });
    }, [defaultedOptions, observer]);

    // Handle suspense
    if (defaultedOptions.suspense && result.isLoading && result.isFetching && !isRestoring) {
        throw observer
            .fetchOptimistic(defaultedOptions)
            .then(({ data }) => {
                defaultedOptions.onSuccess?.(data as TData);
                defaultedOptions.onSettled?.(data, null);
            })
            .catch((error) => {
                errorResetBoundary.clearReset();
                defaultedOptions.onError?.(error);
                defaultedOptions.onSettled?.(undefined, error);
            });
    }

    // Handle error boundary
    if (
        getHasError({
            result,
            errorResetBoundary,
            useErrorBoundary: defaultedOptions.useErrorBoundary,
            query: observer.getCurrentQuery(),
        })
    ) {
        throw result.error;
    }

    // Legend-State changes from here down
    let mutator: UseMutationResult;
    if (mutationOptions) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        mutator = useMutation(mutationOptions) as UseMutationResult;
    }

    const { obs, unsubscribe } = React.useMemo(() => {
        const obs = observable<any>(observer.getCurrentResult());

        let isSetting = false;

        // If there is a mutator watch for changes as long as they don't come from the the query observer
        if (mutator) {
            observe(() => {
                const data = obs.data.get();
                // Don't want to call mutate if there's no data or this coming from the query changing
                if (data && !isSetting) {
                    mutator.mutate(data);
                }
            });
        }

        const unsubscribe = observer.subscribe((result) => {
            isSetting = true;

            try {
                // Update the observable with the latest value
                obs.set(result);
            } finally {
                // If set causes a crash for some reason we still need to reset isSetting
                isSetting = false;
            }
        });

        return { obs, unsubscribe };
    }, []);

    // Unsubscribe from the query observer on unmount
    useUnmount(unsubscribe);

    // Return the observable
    return obs;
}
