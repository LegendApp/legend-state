jest.mock('@tanstack/query-core', () => {
    const refetchMock = jest.fn(() => Promise.resolve({ data: 'fresh', status: 'success' }));

    class QueryObserver {
        client: any;
        options: any;

        constructor(client: any, options: any) {
            this.client = client;
            this.options = options;
        }

        getOptimisticResult() {
            return { isLoading: false, data: 'initial', status: 'success' };
        }

        refetch() {
            return refetchMock();
        }

        subscribe() {
            return () => {};
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
            return {
                findAll: () => [],
                remove: () => {},
            };
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
    };
});

import { Synced } from '@legendapp/state/sync';
import { symbolLinked } from '../../src/globals';
import { syncedQuery } from '../../src/sync-plugins/tanstack-query';
import { QueryClient } from '@tanstack/query-core';

describe('syncedQuery', () => {
    test('get returns refetched data after the initial run', async () => {
        const queryClient = new QueryClient();
        const linkedFactory = syncedQuery({
            queryClient,
            query: {
                queryKey: ['test'],
            },
        }) as () => Synced<any>;

        const options = linkedFactory()[symbolLinked];

        const initial = await options.get!({});
        expect(initial).toBe('initial');

        const second = await options.get!({});
        expect(second).toBe('fresh');
    });
});
