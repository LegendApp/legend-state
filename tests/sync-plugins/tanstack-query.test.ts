import { createQueryCoreMock } from './tanstack-query.mock';

jest.mock('@tanstack/query-core', () => createQueryCoreMock());

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

    test('first get returns cached optimistic data', async () => {
        const queryClient = new QueryClient();
        const linkedFactory = syncedQuery({
            queryClient,
            query: {
                queryKey: ['test-first-get'],
            },
        }) as () => Synced<any>;

        const options = linkedFactory()[symbolLinked];
        const result = await options.get!({});
        expect(result).toBe('initial');
        expect(refetchMock).not.toHaveBeenCalled();
    });

    test('re-observation returns cached data without refetching (TQ observer handles refetch)', async () => {
        const queryClient = new QueryClient();
        const linkedFactory = syncedQuery({
            queryClient,
            query: {
                queryKey: ['test-reobserve'],
            },
        }) as () => Synced<any>;

        const options = linkedFactory()[symbolLinked];
        await options.get!({});
        refetchMock.mockClear();

        // Simulate re-observation: sync infra calls subscribe() then get()
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

        const second = await options.get!({});
        expect(second).toBe('initial');
        expect(refetchMock).not.toHaveBeenCalled();
    });

    test('explicit sync forces refetch even when data is fresh', async () => {
        const queryClient = new QueryClient();
        const linkedFactory = syncedQuery({
            queryClient,
            query: {
                queryKey: ['test-explicit-sync'],
            },
        }) as () => Synced<any>;

        const options = linkedFactory()[symbolLinked];
        await options.get!({});
        refetchMock.mockClear();

        // Explicit sync: get() called without preceding subscribe()
        const second = await options.get!({});
        expect(second).toBe('fresh');
        expect(refetchMock).toHaveBeenCalledTimes(1);
    });

    describe('observer integration', () => {
        test('observer refetch via subscription updates data', async () => {
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
                        queryKey: ['test-subscription-refetch'],
                    },
                }) as () => Synced<any>;

                const options = linkedFactory()[symbolLinked];
                const updateSpy = jest.fn();
                const mockNodeState = {
                    isGetting: { peek: jest.fn(() => false), set: jest.fn() },
                    error: { peek: jest.fn(() => undefined), set: jest.fn() },
                };

                options.subscribe!({
                    update: updateSpy,
                    onError: jest.fn(),
                    node: { state: mockNodeState } as any,
                    value$: {} as any,
                    refresh: jest.fn(),
                    lastSync: undefined,
                });

                // Simulate TQ observer firing a refetch result
                // (e.g., refetchOnMount triggered internally by TQ)
                subscriberCallback!({
                    status: 'success',
                    data: 'refetched-data',
                    error: null,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                });

                expect(updateSpy).toHaveBeenCalledWith({ value: 'refetched-data' });
            } finally {
                OrigObserver.prototype.subscribe = originalSubscribe;
            }
        });

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
