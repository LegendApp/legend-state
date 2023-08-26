import { ObservablePersistRemoteFunctions, type ObservablePersistRemoteSaveParams } from '@legendapp/state';
import {
    MutationObserver,
    QueryClient,
    QueryKey,
    QueryObserver,
    UseBaseQueryOptions,
    UseMutationOptions,
    notifyManager,
} from '@tanstack/react-query';

// interface PersistQueryProps<T> {
//     get: string | RequestInfo;
//     set?: string | RequestInfo;
//     getInit?: RequestInit;
//     setInit?: RequestInit;
//     fn: (obs: T) => void;
//     valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
// }

export function persistQuery<TObs, TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(
    queryClient: QueryClient,
    options: UseBaseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
    mutationOptions?: UseMutationOptions<TData, TError, void>,
    Observer?: typeof QueryObserver,
): ObservablePersistRemoteFunctions<TObs> {
    const defaultedOptions = queryClient.defaultQueryOptions(options);

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

    Observer = Observer || QueryObserver;

    const observer = new Observer<TQueryFnData, TError, TData, TQueryData, TQueryKey>(queryClient, defaultedOptions);

    const ret: ObservablePersistRemoteFunctions = {
        get({ onChange }) {
            const result = observer.getOptimisticResult(defaultedOptions);

            observer.subscribe((result) => {
                onChange({ value: result.data });
            });

            if (result) {
                return result.data;
            }
        },
    };

    if (mutationOptions) {
        const mutator = new MutationObserver(queryClient, mutationOptions);
        ret.set = async ({ value }: ObservablePersistRemoteSaveParams<any>) => {
            mutator.mutate(value);
        };
    }

    return ret;
}
