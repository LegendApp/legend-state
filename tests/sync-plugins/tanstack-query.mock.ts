export function createQueryCoreMock() {
    const refetchMock = jest.fn(() => Promise.resolve({ data: 'fresh', status: 'success' }));
    let subscriberCallback: ((result: any) => void) | undefined;

    const defaultResult = {
        data: 'initial',
        status: 'success',
        isLoading: false,
        isFetching: false,
        isStale: false,
        error: null,
        fetchStatus: 'idle' as const,
    };

    class QueryObserver {
        client: any;
        options: any;
        notifyOptions: any;

        constructor(client: any, options: any) {
            this.client = client;
            this.options = options;
        }

        getOptimisticResult() {
            return defaultResult;
        }

        getCurrentResult() {
            return defaultResult;
        }

        setOptions(_options: any, _notifyOptions?: any) {
            this.options = _options;
            this.notifyOptions = _notifyOptions;
        }

        refetch() {
            return refetchMock();
        }

        subscribe(cb: any) {
            subscriberCallback = cb;
            return () => {
                subscriberCallback = undefined;
            };
        }

        updateResult() {}
    }

    class MutationObserver {
        client: any;
        options: any;

        constructor(client: any, options: any) {
            this.client = client;
            this.options = options;
        }

        mutate(value: any) {
            return Promise.resolve(value);
        }
    }

    class QueryClient {
        defaultQueryOptions(options: any) {
            return options;
        }

        getMutationCache() {
            return { findAll: () => [], remove: () => {} };
        }
    }

    const notifyManager = {
        batchCalls:
            (fn: (...args: any[]) => any) =>
            (...args: any[]) =>
                fn(...args),
    };

    return {
        __esModule: true,
        QueryObserver,
        MutationObserver,
        QueryClient,
        notifyManager,
        DefaultError: Error,
        refetchMock,
        getSubscriberCallback: () => subscriberCallback,
    };
}
