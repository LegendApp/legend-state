import { observable, observe, syncState, when } from '@legendapp/state';
import { QueryClient } from '@tanstack/query-core';
import { syncedQuery } from '../../src/sync-plugins/tanstack-query';
import { promiseTimeout } from '../testglobals';

type Todo = {
    id: number;
    title: string;
};

describe('syncedQuery', () => {
    test('applies selected data from fetches and cache updates', async () => {
        const queryClient = new QueryClient();
        const queryKey = ['todos'] as const;
        let todos: Todo[] = [
            { id: 1, title: 'First' },
            { id: 2, title: 'Second' },
        ];
        const todos$ = observable(
            syncedQuery({
                queryClient,
                query: {
                    queryKey,
                    queryFn: async () => todos,
                    select: (data) => data.length,
                },
            }),
        );
        const state$ = syncState(todos$);
        const unsubscribe = todos$.onChange(() => {});

        try {
            expect(todos$.get()).toBeUndefined();
            await when(() => todos$.get() === 2);
            await when(() => !state$.isGetting.get());
            expect(todos$.get()).toBe(2);

            todos = [{ id: 1, title: 'First' }];
            state$.sync();

            expect(state$.isGetting.get()).toBe(true);
            await when(() => !state$.isGetting.get());
            expect(todos$.get()).toBe(1);

            queryClient.setQueryData<Todo[]>(queryKey, [
                ...todos,
                { id: 2, title: 'Second' },
                { id: 3, title: 'Third' },
            ]);

            await when(() => todos$.get() === 3);
            expect(todos$.get()).toBe(3);
        } finally {
            unsubscribe();
            queryClient.clear();
        }
    });
});

describe('syncedQuery initial selection', () => {
    test.each([false, true])('selects raw initial data before first read (factory %s)', async (factory) => {
        const queryClient = new QueryClient();
        const raw = [
            { id: 1, title: 'First' },
            { id: 2, title: 'Second' },
        ];
        const initialFactory = jest.fn(() => raw);
        const queryKey = ['initial', factory] as const;
        const count$ = observable(
            syncedQuery({
                queryClient,
                query: {
                    queryKey,
                    queryFn: async () => raw,
                    initialData: factory ? initialFactory : raw,
                    select: (data) => data.length,
                    staleTime: Infinity,
                },
            }),
        );
        const unsubscribe = count$.onChange(() => {});
        try {
            expect(count$.get()).toBe(2);
            expect(queryClient.getQueryData(queryKey)).toEqual(raw);
            await when(() => !syncState(count$).isGetting.get());
            queryClient.setQueryData(queryKey, [raw[0]]);
            await when(() => count$.get() === 1);
            expect(count$.get()).toBe(1);
            expect(initialFactory).toHaveBeenCalledTimes(factory ? 1 : 0);
        } finally {
            unsubscribe();
            queryClient.clear();
        }
    });
    test('reads selected cached data without a raw initial value', () => {
        const queryClient = new QueryClient();
        const queryKey = ['pre-cached'] as const;
        const raw = [{ id: 1, title: 'First' }];
        queryClient.setQueryData(queryKey, raw);
        const count$ = observable(
            syncedQuery({
                queryClient,
                query: { queryKey, queryFn: async () => raw, select: (data) => data.length, staleTime: Infinity },
            }),
        );
        const unsubscribe = count$.onChange(() => {});
        try {
            expect(count$.get()).toBe(1);
            expect(queryClient.getQueryData(queryKey)).toEqual(raw);
        } finally {
            unsubscribe();
            queryClient.clear();
        }
    });
    test('keeps selected Legend initial out of the raw query cache', async () => {
        const queryClient = new QueryClient();
        const queryKey = ['legend-initial'] as const;
        const raw = [
            { id: 1, title: 'First' },
            { id: 2, title: 'Second' },
        ];
        let release!: (data: Todo[]) => void;
        const queryFn = jest.fn(
            () =>
                new Promise<Todo[]>((resolve) => {
                    release = resolve;
                }),
        );
        const initial = jest.fn(() => 99);
        const count$ = observable(
            syncedQuery({
                queryClient,
                initial,
                query: { queryKey, queryFn, select: (data) => data.length },
            }),
        );
        const unsubscribe = count$.onChange(() => {});
        try {
            expect(count$.get()).toBe(99);
            expect(queryClient.getQueryData(queryKey)).toBeUndefined();
            expect(queryFn).toHaveBeenCalledTimes(1);
            release(raw);
            await when(() => count$.get() === 2);
            expect(queryClient.getQueryData(queryKey)).toEqual(raw);
            expect(initial).toHaveBeenCalledTimes(1);
        } finally {
            unsubscribe();
            queryClient.clear();
        }
    });
    test('preserves Legend initial cache seeding without a selector', () => {
        const queryClient = new QueryClient();
        const queryKey = ['unselected'] as const;
        const value$ = observable(
            syncedQuery({
                queryClient,
                initial: 10,
                query: { queryKey, queryFn: async () => 20, enabled: false, initialData: 7 },
            }),
        );
        const unsubscribe = value$.onChange(() => {});
        try {
            expect(value$.get()).toBe(10);
            expect(queryClient.getQueryData(queryKey)).toBe(10);
        } finally {
            unsubscribe();
            queryClient.clear();
        }
    });
});

describe('syncedQuery effective selection', () => {
    test.each(['client', 'key', 'key-function'])(
        'keeps selected initial out of raw cache with %s defaults',
        async (kind) => {
            const select = jest.fn((data: unknown) => (Array.isArray(data) ? data.length : -1));
            const queryClient = new QueryClient({
                defaultOptions: { queries: kind === 'client' ? { select } : undefined },
            });
            const queryKey = ['default-select', kind] as const;
            if (kind !== 'client') queryClient.setQueryDefaults(queryKey, { select });
            let release!: (data: Todo[]) => void;
            const raw = [
                { id: 1, title: 'First' },
                { id: 2, title: 'Second' },
            ];
            const count$ = observable(
                syncedQuery<Todo[], Error, number, typeof queryKey>({
                    queryClient,
                    initial: 99,
                    query: {
                        queryKey: kind === 'key-function' ? () => queryKey : queryKey,
                        queryFn: () =>
                            new Promise<Todo[]>((resolve) => {
                                release = resolve;
                            }),
                    },
                }),
            );
            const unsubscribe = count$.onChange(() => {});
            try {
                expect(count$.get()).toBe(99);
                expect(queryClient.getQueryData(queryKey)).toBeUndefined();
                release(raw);
                await when(() => count$.get() === 2);
                expect(queryClient.getQueryData(queryKey)).toEqual(raw);
                expect(select).toHaveBeenCalledWith(raw);
                expect(select).not.toHaveBeenCalledWith(99);
            } finally {
                unsubscribe();
                queryClient.clear();
            }
        },
    );
    test('selects placeholder data while leaving the raw cache empty', async () => {
        const queryClient = new QueryClient();
        const queryKey = ['placeholder-selection'] as const;
        let release!: (data: Todo[]) => void;
        const raw = [
            { id: 1, title: 'First' },
            { id: 2, title: 'Second' },
        ];
        const count$ = observable(
            syncedQuery({
                queryClient,
                query: {
                    queryKey,
                    queryFn: () =>
                        new Promise<Todo[]>((resolve) => {
                            release = resolve;
                        }),
                    placeholderData: raw,
                    select: (data) => data.length,
                },
            }),
        );
        const unsubscribe = count$.onChange(() => {});
        try {
            expect(count$.get()).toBe(2);
            expect(queryClient.getQueryData(queryKey)).toBeUndefined();
            const fetched = [...raw, { id: 3, title: 'Third' }];
            release(fetched);
            await when(() => count$.get() === 3);
            expect(queryClient.getQueryData(queryKey)).toEqual(fetched);
        } finally {
            unsubscribe();
            queryClient.clear();
        }
    });
});

test('syncedQuery resolves per-key selected defaults again when a reactive key changes', async () => {
    const queryClient = new QueryClient();
    const key$ = observable('one');
    const rawOne = [{ id: 1, title: 'First' }];
    const rawTwo = [...rawOne, { id: 2, title: 'Second' }];
    const select = jest.fn((data: unknown) => (Array.isArray(data) ? data.length : -1));
    queryClient.setQueryDefaults(['reactive-default', 'one'], { select });
    queryClient.setQueryDefaults(['reactive-default', 'two'], { select });
    const count$ = observable(
        syncedQuery<Todo[], Error, number, readonly ['reactive-default', string]>({
            queryClient,
            initial: 99,
            query: {
                queryKey: () => ['reactive-default', key$.get()] as const,
                queryFn: async ({ queryKey }) => (queryKey[1] === 'one' ? rawOne : rawTwo),
            },
        }),
    );
    const unsubscribe = count$.onChange(() => {});
    try {
        expect(count$.get()).toBe(99);
        expect(queryClient.getQueryData(['reactive-default', 'one'])).toBeUndefined();
        await when(() => count$.get() === 1);
        key$.set('two');
        await when(() => count$.get() === 2);
        expect(queryClient.getQueryData(['reactive-default', 'one'])).toEqual(rawOne);
        expect(queryClient.getQueryData(['reactive-default', 'two'])).toEqual(rawTwo);
        expect(select).toHaveBeenCalledWith(rawOne);
        expect(select).toHaveBeenCalledWith(rawTwo);
        expect(select).not.toHaveBeenCalledWith(99);
    } finally {
        unsubscribe();
        queryClient.clear();
    }
});

describe('syncedQuery with QueryClient', () => {
    let client: QueryClient;
    const disposers: (() => void)[] = [];

    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } });
    });

    afterEach(() => {
        disposers.splice(0).forEach((dispose) => dispose());
        client.clear();
    });

    test('loads uncached data and settles the initial get', async () => {
        let resolve!: (value: string) => void;
        const data = new Promise<string>((r) => (resolve = r));
        const obs$ = observable(
            syncedQuery({
                queryClient: client,
                query: { queryKey: ['initial'], queryFn: () => data },
            }),
        );
        obs$.get();
        await promiseTimeout(5);
        expect(syncState(obs$).isGetting.peek()).toBe(true);
        resolve('loaded');
        await when(() => obs$.get() === 'loaded');
        expect(syncState(obs$).isLoaded.peek()).toBe(true);
        expect(syncState(obs$).isGetting.peek()).toBe(false);
    });

    test('reads fresh cached data without fetching and receives cache updates', async () => {
        client.setQueryData(['cached'], 'cached');
        const queryFn = jest.fn(async () => 'fetched');
        const obs$ = observable(syncedQuery({ queryClient: client, query: { queryKey: ['cached'], queryFn } }));
        disposers.push(observe(() => obs$.get()));
        await when(syncState(obs$).isLoaded);
        expect(obs$.peek()).toBe('cached');
        expect(queryFn).not.toHaveBeenCalled();
        client.setQueryData(['cached'], 'updated');
        await when(() => obs$.get() === 'updated');
        expect(queryFn).not.toHaveBeenCalled();
    });

    test('re-observation leaves refetch decisions to Query but explicit sync always refetches', async () => {
        client.setQueryData(['reobserve'], 'cached');
        client.setQueryDefaults(['reobserve'], { gcTime: Infinity });
        const queryFn = jest.fn(async () => 'fetched');
        const obs$ = observable(
            syncedQuery({
                queryClient: client,
                query: { queryKey: ['reobserve'], queryFn, refetchOnMount: false },
            }),
        );
        const dispose = observe(() => obs$.get());
        await when(syncState(obs$).isLoaded);
        dispose();
        await promiseTimeout(5);
        disposers.push(observe(() => obs$.get()));
        await promiseTimeout(5);
        expect(queryFn).not.toHaveBeenCalled();

        await syncState(obs$).sync();
        await promiseTimeout(5);
        expect(queryFn).toHaveBeenCalledTimes(1);
        expect(obs$.peek()).toBe('fetched');

        await syncState(obs$).sync();
        await promiseTimeout(5);
        expect(queryFn).toHaveBeenCalledTimes(2);
    });

    test('refetchOnMount still refreshes stale data after re-observation', async () => {
        client.setQueryData(['stale'], 'cached');
        client.setQueryDefaults(['stale'], { gcTime: Infinity });
        const queryFn = jest.fn(async () => 'fetched');
        const obs$ = observable(
            syncedQuery({
                queryClient: client,
                query: { queryKey: ['stale'], queryFn, staleTime: 0, refetchOnMount: true },
            }),
        );
        const dispose = observe(() => obs$.get());
        await when(() => obs$.get() === 'fetched');
        dispose();
        await promiseTimeout(5);
        disposers.push(observe(() => obs$.get()));
        await promiseTimeout(5);
        expect(queryFn).toHaveBeenCalledTimes(2);
    });

    for (const cached of [false, true]) {
        test(`reports ${cached ? 'background' : 'initial'} errors without throwing and recovers on sync`, async () => {
            const key = ['error', cached];
            if (cached) client.setQueryData(key, 'cached');
            const error = new Error('Network failure');
            let shouldFail = true;
            const onError = jest.fn();
            const obs$ = observable(
                syncedQuery({
                    queryClient: client,
                    query: {
                        queryKey: key,
                        queryFn: async () => {
                            if (shouldFail) throw error;
                            return 'recovered';
                        },
                        staleTime: 0,
                    },
                    onError,
                }),
            );
            disposers.push(observe(() => obs$.get()));
            await when(() => syncState(obs$).error.get() === error);
            await promiseTimeout(5);
            expect(onError).toHaveBeenCalledTimes(1);
            expect(syncState(obs$).isGetting.peek()).toBe(false);
            expect(syncState(obs$).numPendingGets.peek()).toBe(0);

            shouldFail = false;
            await syncState(obs$).sync();
            await when(() => obs$.get() === 'recovered');
            await promiseTimeout(5);
            expect(syncState(obs$).error.peek()).toBeUndefined();
            expect(syncState(obs$).isGetting.peek()).toBe(false);
        });
    }

    for (const recovery of ['refetch', 'cache', 'reobserve', 'unobserved'] as const) {
        test(`recovers an initial failure through QueryClient ${recovery} without an extra fetch`, async () => {
            const key = ['recover', recovery];
            const error = new Error('offline');
            let shouldFail = true;
            const queryFn = jest.fn(async () => {
                if (shouldFail) throw error;
                return 'recovered';
            });
            const obs$ = observable(
                syncedQuery({
                    queryClient: client,
                    query: { queryKey: key, queryFn, gcTime: Infinity },
                }),
            );
            const dispose = recovery === 'unobserved' ? () => {} : observe(() => obs$.get());
            obs$.get();
            disposers.push(dispose);
            const state$ = syncState(obs$);
            await when(() => state$.error.get() === error);
            await promiseTimeout(5);
            expect(state$.isLoaded.peek()).toBe(false);
            expect(state$.isGetting.peek()).toBe(false);

            shouldFail = false;
            if (recovery === 'cache') {
                client.setQueryData(key, 'recovered');
            } else if (recovery === 'reobserve') {
                dispose();
                await promiseTimeout(5);
                disposers.push(observe(() => obs$.get()));
            } else {
                await client.refetchQueries({ queryKey: key });
            }
            await promiseTimeout(10);
            expect(client.getQueryData(key)).toBe('recovered');
            expect(state$.isLoaded.peek()).toBe(true);
            expect(obs$.peek()).toBe('recovered');
            expect(state$.isGetting.peek()).toBe(false);
            expect(state$.numPendingGets.peek()).toBe(0);
            expect(state$.error.peek()).toBeUndefined();
            expect(queryFn).toHaveBeenCalledTimes(recovery === 'cache' ? 1 : 2);

            if (recovery === 'unobserved') disposers.push(observe(() => obs$.get()));
            await state$.sync();
            await promiseTimeout(5);
            expect(queryFn).toHaveBeenCalledTimes(recovery === 'cache' ? 2 : 3);
        });
    }

    test('mutations still receive local changes', async () => {
        client.setQueryData(['mutation'], 'cached');
        const mutationFn = jest.fn(async (value: string) => value);
        const obs$ = observable(
            syncedQuery({
                queryClient: client,
                query: { queryKey: ['mutation'], queryFn: async () => 'cached' },
                mutation: { mutationFn },
            }),
        );
        obs$.get();
        await when(syncState(obs$).isLoaded);
        obs$.set('changed');
        await promiseTimeout(5);
        expect(mutationFn).toHaveBeenCalledWith('changed');
    });
});
