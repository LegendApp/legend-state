import { runWithRetry } from '../src/sync/retry';
import { syncObservable } from '@legendapp/state/sync';
import { observable, observe, syncState } from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { BasicValue, getPersistName, ObservablePersistLocalStorage, promiseTimeout } from './testglobals';

jest?.setTimeout?.(1000);

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});

describe('sync()', () => {
    test('sync() triggers sync', async () => {
        const persistName = getPersistName();
        let numLists = 0;
        const serverState = [{ ...ItemBasicValue(), updatedAt: 1 }];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    numLists++;
                    return promiseTimeout(0, serverState);
                },
                create: async (input) => {
                    return { ...input, updatedAt: 2 };
                },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        const state$ = syncState(obs$);

        expect(numLists).toEqual(0);

        obs$.get();

        expect(numLists).toEqual(1);

        const doSync = () => {
            serverState[0].updatedAt++;
            state$.sync();
        };
        doSync();
        expect(numLists).toEqual(2);
        doSync();
        expect(numLists).toEqual(3);
        doSync();
        expect(numLists).toEqual(4);
    });
    test('sync() triggers sync without needing a get', async () => {
        const persistName = getPersistName();
        let numLists = 0;
        const serverState = [{ ...ItemBasicValue(), updatedAt: 1 }];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    numLists++;
                    return promiseTimeout(0, serverState);
                },
                create: async (input) => {
                    return { ...input, updatedAt: 2 };
                },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        const state$ = syncState(obs$);

        expect(numLists).toEqual(0);

        const doSync = () => {
            serverState[0].updatedAt++;
            state$.sync();
        };
        doSync();
        expect(numLists).toEqual(1);
        doSync();
        expect(numLists).toEqual(2);
        doSync();
        expect(numLists).toEqual(3);
    });
    test('sync({ resetLastSync: true }) clears lastSync before list', async () => {
        const persistName = getPersistName();
        let updatedAt = 1;
        const serverState = [{ ...ItemBasicValue(), updatedAt }];
        const lastSyncCalls: Array<number | undefined> = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: (params) => {
                    lastSyncCalls.push(params.lastSync);
                    return promiseTimeout(0, serverState);
                },
                create: async (input) => ({ ...input, updatedAt: updatedAt++ }),
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        const state$ = syncState(obs$);

        obs$.get();
        await promiseTimeout(0);
        expect(lastSyncCalls).toHaveLength(1);
        expect(lastSyncCalls[0]).toBeUndefined();

        await state$.sync();
        expect(lastSyncCalls).toHaveLength(2);
        expect(lastSyncCalls[1]).not.toBeUndefined();

        await state$.sync({ resetLastSync: true });
        expect(lastSyncCalls).toHaveLength(3);
        expect(lastSyncCalls[2]).toBeUndefined();

        await state$.sync();
        expect(lastSyncCalls).toHaveLength(4);
        expect(lastSyncCalls[1]).not.toBeUndefined();
    });
});

describe('retry timeout ownership', () => {
    test('a superseded timer rejects its owner with its last failure', async () => {
        const failure = new Error('superseded attempt');
        const id = {};
        const state = { retryNum: 0, cancelRetry: false } as any;
        const options = { delay: 40, times: 3, backoff: 'constant' } as const;
        const first = runWithRetry(state, options, id, () => Promise.reject(failure));
        let outcome: unknown;
        const settled = first.catch((error) => {
            outcome = error;
        });
        await promiseTimeout(0);
        let finish!: (value: number) => void;
        const second = runWithRetry(
            { retryNum: 0 } as any,
            options,
            id,
            () =>
                new Promise<number>((resolve) => {
                    finish = resolve;
                }),
        );
        await promiseTimeout(0);
        expect(outcome).toBe(failure);
        expect(state.cancelRetry).toBe(false);
        finish(2);
        expect(await second).toBe(2);
        await settled;
    });
    test('an older completion does not remove a newer scheduled retry', async () => {
        const id = {};
        const options = { delay: 40, times: 3, backoff: 'constant' } as const;
        let finish!: (value: number) => void;
        const first = runWithRetry(
            { retryNum: 0 } as any,
            options,
            id,
            () =>
                new Promise<number>((resolve) => {
                    finish = resolve;
                }),
        );
        const failure = new Error('newer retry');
        const second = runWithRetry({ retryNum: 0 } as any, options, id, () => Promise.reject(failure));
        let outcome: unknown;
        const settled = second.catch((error) => {
            outcome = error;
        });
        await promiseTimeout(0);
        finish(1);
        expect(await first).toBe(1);
        expect(await runWithRetry({ retryNum: 0 } as any, options, id, async () => 3)).toBe(3);
        await promiseTimeout(0);
        expect(outcome).toBe(failure);
        await settled;
    });
    test('finite retries and explicit cancellation keep their existing failure semantics', async () => {
        const failure = new Error('retry failure');
        let attempts = 0;
        const state = { retryNum: 0 } as any;
        await expect(
            runWithRetry(state, { delay: 1, times: 2 }, {}, async () => {
                attempts++;
                throw failure;
            }),
        ).rejects.toBe(failure);
        expect(attempts).toBe(2);
        expect(state.retryNum).toBe(2);
        expect(state.cancelRetry).toBe(true);
        attempts = 0;
        await expect(
            runWithRetry({ retryNum: 0, cancelRetry: true } as any, { delay: 1, infinite: true }, {}, async () => {
                attempts++;
                throw failure;
            }),
        ).rejects.toBe(failure);
        expect(attempts).toBe(1);
    });
});

describe('sync retry synchronous supersession', () => {
    test('a synchronous GET success settles an older scheduled retry', async () => {
        let gets = 0;
        const errors: Error[] = [];
        const obs = observable({ value: 0 });
        syncObservable(obs, {
            retry: { delay: 40, times: 3, backoff: 'constant' },
            get: () => {
                if (++gets === 2) return Promise.reject(new Error('retrying refresh'));
                return { value: gets };
            },
            onError: (error) => errors.push(error),
        });
        const dispose = observe(() => obs.get());
        try {
            obs.get();
            await promiseTimeout(0);
            const older = syncState(obs).sync();
            await promiseTimeout(10);
            expect(gets).toBe(2);
            expect(syncState(obs).numPendingGets.peek()).toBe(1);
            await syncState(obs).sync();
            expect(gets).toBe(3);
            await promiseTimeout(0);
            expect(syncState(obs).numPendingGets.peek()).toBe(0);
            expect(syncState(obs).isGetting.peek()).toBe(false);
            await older;
            await promiseTimeout(60);
            expect(gets).toBe(3);
            expect(obs.peek()).toEqual({ value: 3 });
            expect(errors).toEqual([]);
        } finally {
            dispose();
        }
    });
});

describe('sync retry operation identity', () => {
    test('a successful SET does not cancel a pending GET retry', async () => {
        let server = 0;
        let gets = 0;
        let sets = 0;
        const errors: Error[] = [];
        const obs = observable({ value: 0 });
        syncObservable(obs, {
            retry: { delay: 40, times: 3, backoff: 'constant' },
            get: async () => {
                if (++gets === 2) throw new Error('refresh retry');
                return { value: server };
            },
            set: async ({ value }) => {
                sets++;
                server = value.value;
            },
            onError: (error) => errors.push(error),
        });
        const dispose = observe(() => obs.get());
        try {
            obs.get();
            await promiseTimeout(0);
            const refreshed = syncState(obs).sync();
            await promiseTimeout(10);
            expect(gets).toBe(2);
            expect(syncState(obs).numPendingGets.peek()).toBe(1);
            obs.value.set(2);
            await refreshed;
            await promiseTimeout(90);
            expect(gets).toBe(3);
            expect(sets).toBe(1);
            expect(errors).toEqual([]);
            expect(server).toBe(2);
            expect(obs.peek()).toEqual({ value: 2 });
            expect(syncState(obs).numPendingGets.peek()).toBe(0);
            expect(syncState(obs).isGetting.peek()).toBe(false);
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            expect(syncState(obs).getPendingChanges()).toEqual({});
        } finally {
            dispose();
        }
    });
});
