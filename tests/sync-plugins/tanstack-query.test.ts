jest.mock('@tanstack/query-core', () => {
    const refetchMock = jest.fn(() => Promise.resolve({ data: 'fresh', status: 'success' }));

    class QueryObserver {
        client: any;
        options: any;
        notifyOptions: any;

        constructor(client: any, options: any) {
            this.client = client;
            this.options = options;
        }

        getOptimisticResult() {
            return {
                data: 'initial',
                status: 'success',
                isLoading: false,
                isFetching: false,
                isStale: false,
                error: null,
                fetchStatus: 'idle' as const,
            };
        }

        getCurrentResult() {
            return {
                data: 'initial',
                status: 'success',
                isLoading: false,
                isFetching: false,
                isStale: false,
                error: null,
                fetchStatus: 'idle' as const,
            };
        }

        setOptions(_options: any, _notifyOptions?: any) {
            this.options = _options;
            this.notifyOptions = _notifyOptions;
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

        getQueryCache() {
            return {
                find: () => ({
                    state: { dataUpdatedAt: Date.now() },
                    isStaleByTime: 0,
                    getObserversCount: () => 1,
                }),
            };
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
        refetchMock,
    };
});

import { Synced } from '@legendapp/state/sync';
import { symbolLinked } from '../../src/globals';
import { syncedQuery, QueryState } from '../../src/sync-plugins/tanstack-query';
import { QueryClient } from '@tanstack/query-core';

const { refetchMock } = jest.requireMock('@tanstack/query-core') as { refetchMock: jest.Mock };

describe('syncedQuery', () => {
    beforeEach(() => {
        refetchMock.mockClear();
        refetchMock.mockImplementation(() => Promise.resolve({ data: 'fresh', status: 'success' }));
    });

    test('get returns refetched data after the initial run (stale data)', async () => {
        const queryClient = new QueryClient();
        const mockModule = jest.requireMock('@tanstack/query-core') as any;
        const OrigObserver = mockModule.QueryObserver;
        const originalGetCurrentResult = OrigObserver.prototype.getCurrentResult;

        OrigObserver.prototype.getCurrentResult = function () {
            return {
                data: 'initial',
                status: 'success',
                isLoading: false,
                isFetching: false,
                isStale: true,
                error: null,
                fetchStatus: 'idle',
            };
        };

        try {
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
        } finally {
            OrigObserver.prototype.getCurrentResult = originalGetCurrentResult;
        }
    });

    describe('refetchOnMount control', () => {
        test('refetchOnMount: false - returns cached data without refetching', async () => {
            const queryClient = new QueryClient();
            const linkedFactory = syncedQuery({
                queryClient,
                query: {
                    queryKey: ['test-no-refetch'],
                    refetchOnMount: false,
                },
            }) as () => Synced<any>;

            const options = linkedFactory()[symbolLinked];

            const initial = await options.get!({});
            expect(initial).toBe('initial');

            refetchMock.mockClear();
            const second = await options.get!({});
            expect(second).toBe('initial');
            expect(refetchMock).not.toHaveBeenCalled();
        });

        test('refetchOnMount: "always" - always refetches even if data is fresh', async () => {
            const queryClient = new QueryClient();
            const linkedFactory = syncedQuery({
                queryClient,
                query: {
                    queryKey: ['test-always-refetch'],
                    refetchOnMount: 'always',
                },
            }) as () => Synced<any>;

            const options = linkedFactory()[symbolLinked];

            const initial = await options.get!({});
            expect(initial).toBe('initial');

            refetchMock.mockClear();
            const second = await options.get!({});
            expect(second).toBe('fresh');
            expect(refetchMock).toHaveBeenCalledTimes(1);
        });

        test('refetchOnMount: callback returning false - returns cached data without refetching', async () => {
            const queryClient = new QueryClient();
            const callbackSpy = jest.fn(() => false as const);

            const linkedFactory = syncedQuery({
                queryClient,
                query: {
                    queryKey: ['test-callback-false'],
                    refetchOnMount: callbackSpy,
                },
            }) as () => Synced<any>;

            const options = linkedFactory()[symbolLinked];

            const initial = await options.get!({});
            expect(initial).toBe('initial');

            refetchMock.mockClear();
            const second = await options.get!({});
            expect(second).toBe('initial');
            expect(refetchMock).not.toHaveBeenCalled();
            expect(callbackSpy).toHaveBeenCalledTimes(1);
            expect(callbackSpy).toHaveBeenCalledWith(expect.objectContaining({ state: expect.any(Object) }));
        });

        test('refetchOnMount: callback returning "always" - always refetches', async () => {
            const queryClient = new QueryClient();
            const callbackSpy = jest.fn(() => 'always' as const);

            const linkedFactory = syncedQuery({
                queryClient,
                query: {
                    queryKey: ['test-callback-always'],
                    refetchOnMount: callbackSpy,
                },
            }) as () => Synced<any>;

            const options = linkedFactory()[symbolLinked];

            const initial = await options.get!({});
            expect(initial).toBe('initial');

            refetchMock.mockClear();
            const second = await options.get!({});
            expect(second).toBe('fresh');
            expect(refetchMock).toHaveBeenCalledTimes(1);
            expect(callbackSpy).toHaveBeenCalledTimes(1);
        });

        test('refetchOnMount: true - refetches when data is stale', async () => {
            const queryClient = new QueryClient();
            const mockModule = jest.requireMock('@tanstack/query-core') as any;
            const OrigObserver = mockModule.QueryObserver;
            const originalGetCurrentResult = OrigObserver.prototype.getCurrentResult;

            OrigObserver.prototype.getCurrentResult = function () {
                return {
                    data: 'initial',
                    status: 'success',
                    isLoading: false,
                    isFetching: false,
                    isStale: true,
                    error: null,
                    fetchStatus: 'idle',
                };
            };

            try {
                const linkedFactory = syncedQuery({
                    queryClient,
                    query: {
                        queryKey: ['test-stale-refetch'],
                        refetchOnMount: true,
                    },
                }) as () => Synced<any>;

                const options = linkedFactory()[symbolLinked];

                const initial = await options.get!({});
                expect(initial).toBe('initial');

                refetchMock.mockClear();
                const second = await options.get!({});
                expect(second).toBe('fresh');
                expect(refetchMock).toHaveBeenCalledTimes(1);
            } finally {
                OrigObserver.prototype.getCurrentResult = originalGetCurrentResult;
            }
        });
    });

    describe('observer integration', () => {
        test('error from observer is forwarded to onError and onQueryStateChange', async () => {
            const queryClient = new QueryClient();
            const stateChanges: QueryState[] = [];
            let subscriberCallback: ((result: any) => void) | undefined;
            const mockModule = jest.requireMock('@tanstack/query-core') as any;
            const OrigObserver = mockModule.QueryObserver;
            const originalSubscribe = OrigObserver.prototype.subscribe;

            OrigObserver.prototype.subscribe = function (cb: any) {
                subscriberCallback = cb;
                return () => {
                    subscriberCallback = undefined;
                };
            };

            try {
                const linkedFactory = syncedQuery({
                    queryClient,
                    query: {
                        queryKey: ['test-observer-error'],
                    },
                    onQueryStateChange: (state) => {
                        stateChanges.push({ ...state });
                    },
                }) as () => Synced<any>;

                const options = linkedFactory()[symbolLinked];

                const errorSpy = jest.fn();
                const updateSpy = jest.fn();
                const mockNodeState = {
                    isGetting: { peek: jest.fn(() => false), set: jest.fn() },
                    error: { peek: jest.fn(() => undefined), set: jest.fn() },
                };

                options.subscribe!({
                    update: updateSpy,
                    onError: errorSpy,
                    node: { state: mockNodeState } as any,
                    value$: {} as any,
                    refresh: jest.fn(),
                    lastSync: undefined,
                });

                expect(subscriberCallback).toBeDefined();

                const testError = new Error('Query failed');
                subscriberCallback!({
                    status: 'error',
                    error: testError,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                    data: undefined,
                });

                expect(errorSpy).toHaveBeenCalledWith(testError);
                expect(stateChanges).toHaveLength(1);
                expect(stateChanges[0]).toEqual({
                    isLoading: false,
                    isFetching: false,
                    error: testError,
                    status: 'error',
                    fetchStatus: 'idle',
                });
            } finally {
                OrigObserver.prototype.subscribe = originalSubscribe;
            }
        });

        test('success from observer updates value and clears error', async () => {
            const queryClient = new QueryClient();
            const stateChanges: QueryState[] = [];
            let subscriberCallback: ((result: any) => void) | undefined;

            const mockModule = jest.requireMock('@tanstack/query-core') as any;
            const OrigObserver = mockModule.QueryObserver;
            const originalSubscribe = OrigObserver.prototype.subscribe;

            OrigObserver.prototype.subscribe = function (cb: any) {
                subscriberCallback = cb;
                return () => {
                    subscriberCallback = undefined;
                };
            };

            try {
                const linkedFactory = syncedQuery({
                    queryClient,
                    query: {
                        queryKey: ['test-observer-success'],
                    },
                    onQueryStateChange: (state) => {
                        stateChanges.push({ ...state });
                    },
                }) as () => Synced<any>;

                const options = linkedFactory()[symbolLinked];

                const errorSpy = jest.fn();
                const updateSpy = jest.fn();
                const prevError = new Error('previous error');
                const mockNodeState = {
                    isGetting: { peek: jest.fn(() => false), set: jest.fn() },
                    error: { peek: jest.fn(() => prevError), set: jest.fn() },
                };

                options.subscribe!({
                    update: updateSpy,
                    onError: errorSpy,
                    node: { state: mockNodeState } as any,
                    value$: {} as any,
                    refresh: jest.fn(),
                    lastSync: undefined,
                });

                subscriberCallback!({
                    status: 'success',
                    data: 'new-data',
                    error: null,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                });

                expect(updateSpy).toHaveBeenCalledWith({ value: 'new-data' });
                expect(errorSpy).not.toHaveBeenCalled();
                expect(mockNodeState.error.set).toHaveBeenCalledWith(undefined);
                expect(stateChanges).toHaveLength(1);
                expect(stateChanges[0].status).toBe('success');
                expect(stateChanges[0].error).toBeNull();
            } finally {
                OrigObserver.prototype.subscribe = originalSubscribe;
            }
        });

        test('isFetching state is propagated to node.state.isGetting', async () => {
            const queryClient = new QueryClient();
            let subscriberCallback: ((result: any) => void) | undefined;

            const mockModule = jest.requireMock('@tanstack/query-core') as any;
            const OrigObserver = mockModule.QueryObserver;
            const originalSubscribe = OrigObserver.prototype.subscribe;

            OrigObserver.prototype.subscribe = function (cb: any) {
                subscriberCallback = cb;
                return () => {
                    subscriberCallback = undefined;
                };
            };

            try {
                const linkedFactory = syncedQuery({
                    queryClient,
                    query: {
                        queryKey: ['test-observer-fetching'],
                    },
                }) as () => Synced<any>;

                const options = linkedFactory()[symbolLinked];

                let currentIsGetting = false;
                const mockNodeState = {
                    isGetting: {
                        peek: jest.fn(() => currentIsGetting),
                        set: jest.fn((val: boolean) => {
                            currentIsGetting = val;
                        }),
                    },
                    error: { peek: jest.fn(() => undefined), set: jest.fn() },
                };

                options.subscribe!({
                    update: jest.fn(),
                    onError: jest.fn(),
                    node: { state: mockNodeState } as any,
                    value$: {} as any,
                    refresh: jest.fn(),
                    lastSync: undefined,
                });

                subscriberCallback!({
                    status: 'success',
                    data: 'data',
                    error: null,
                    isLoading: false,
                    isFetching: true,
                    isStale: false,
                    fetchStatus: 'fetching',
                });

                expect(mockNodeState.isGetting.set).toHaveBeenCalledWith(true);

                mockNodeState.isGetting.set.mockClear();
                subscriberCallback!({
                    status: 'success',
                    data: 'fresh-data',
                    error: null,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                });

                expect(mockNodeState.isGetting.set).toHaveBeenCalledWith(false);
            } finally {
                OrigObserver.prototype.subscribe = originalSubscribe;
            }
        });

        test('onQueryStateChange tracks full lifecycle: loading -> error -> retry -> success', async () => {
            const queryClient = new QueryClient();
            const stateChanges: QueryState[] = [];
            let subscriberCallback: ((result: any) => void) | undefined;

            const mockModule = jest.requireMock('@tanstack/query-core') as any;
            const OrigObserver = mockModule.QueryObserver;
            const originalSubscribe = OrigObserver.prototype.subscribe;

            OrigObserver.prototype.subscribe = function (cb: any) {
                subscriberCallback = cb;
                return () => {
                    subscriberCallback = undefined;
                };
            };

            try {
                const linkedFactory = syncedQuery({
                    queryClient,
                    query: {
                        queryKey: ['test-error-recovery'],
                    },
                    onQueryStateChange: (state) => {
                        stateChanges.push({ ...state });
                    },
                }) as () => Synced<any>;

                const options = linkedFactory()[symbolLinked];
                const mockNodeState = {
                    isGetting: { peek: jest.fn(() => false), set: jest.fn() },
                    error: { peek: jest.fn(() => undefined), set: jest.fn() },
                };

                options.subscribe!({
                    update: jest.fn(),
                    onError: jest.fn(),
                    node: { state: mockNodeState } as any,
                    value$: {} as any,
                    refresh: jest.fn(),
                    lastSync: undefined,
                });

                const networkError = new Error('Network failed');

                // Phase 1: Loading
                subscriberCallback!({
                    status: 'pending',
                    data: undefined,
                    error: null,
                    isLoading: true,
                    isFetching: true,
                    isStale: false,
                    fetchStatus: 'fetching',
                });

                // Phase 2: Error
                subscriberCallback!({
                    status: 'error',
                    data: undefined,
                    error: networkError,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                });

                // Phase 3: Retry
                subscriberCallback!({
                    status: 'error',
                    data: undefined,
                    error: networkError,
                    isLoading: false,
                    isFetching: true,
                    isStale: false,
                    fetchStatus: 'fetching',
                });

                // Phase 4: Success
                subscriberCallback!({
                    status: 'success',
                    data: 'recovered-data',
                    error: null,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                });

                expect(stateChanges).toHaveLength(4);
                expect(stateChanges[1]).toMatchObject({ status: 'error', error: networkError });
                expect(stateChanges[3]).toMatchObject({ status: 'success', error: null });
            } finally {
                OrigObserver.prototype.subscribe = originalSubscribe;
            }
        });

        test('initial load error rejects the get promise', async () => {
            const queryClient = new QueryClient();
            let subscriberCallback: ((result: any) => void) | undefined;

            const mockModule = jest.requireMock('@tanstack/query-core') as any;
            const OrigObserver = mockModule.QueryObserver;
            const originalSubscribe = OrigObserver.prototype.subscribe;
            const originalGetOptimistic = OrigObserver.prototype.getOptimisticResult;

            OrigObserver.prototype.getOptimisticResult = function () {
                return {
                    isLoading: true,
                    data: undefined,
                    status: 'pending',
                    isFetching: true,
                    isStale: false,
                    error: null,
                    fetchStatus: 'fetching',
                };
            };

            OrigObserver.prototype.subscribe = function (cb: any) {
                subscriberCallback = cb;
                return () => {
                    subscriberCallback = undefined;
                };
            };

            try {
                const linkedFactory = syncedQuery({
                    queryClient,
                    query: {
                        queryKey: ['test-initial-error'],
                    },
                }) as () => Synced<any>;

                const options = linkedFactory()[symbolLinked];

                const errorSpy = jest.fn();
                options.subscribe!({
                    update: jest.fn(),
                    onError: errorSpy,
                    node: {
                        state: {
                            isGetting: { peek: jest.fn(() => false), set: jest.fn() },
                            error: { peek: jest.fn(() => undefined), set: jest.fn() },
                        },
                    } as any,
                    value$: {} as any,
                    refresh: jest.fn(),
                    lastSync: undefined,
                });

                const getPromise = options.get!({});

                const loadError = new Error('Initial load failed');
                subscriberCallback!({
                    status: 'error',
                    data: undefined,
                    error: loadError,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                });

                await expect(getPromise).rejects.toThrow('Initial load failed');
                expect(errorSpy).toHaveBeenCalledWith(loadError);
            } finally {
                OrigObserver.prototype.subscribe = originalSubscribe;
                OrigObserver.prototype.getOptimisticResult = originalGetOptimistic;
            }
        });
    });
});
