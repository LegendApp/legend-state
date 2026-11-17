import { runWithRetry } from '../src/sync/retry';
import { syncObservable, synced } from '@legendapp/state/sync';
import { observable, observe, syncState, when } from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { BasicValue, getPersistName, ObservablePersistLocalStorage, promiseTimeout, localStorage } from './testglobals';

jest?.setTimeout?.(1000);

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});

describe('sync()', () => {
    test.each(['manual', 'auto'] as const)(
        'explicit sync waits for asynchronous persistence in %s mode',
        async (syncMode) => {
            const persistName = getPersistName();
            const stored = { id1: { id: 'id1', test: 'offline' } };
            localStorage.setItem(persistName, JSON.stringify(stored));
            localStorage.setItem(
                persistName + '__m',
                JSON.stringify({ lastSync: 17, pending: { id1: { p: null, t: ['object'], v: stored.id1 } } }),
            );
            let releaseLoad!: () => void;
            const loadGate = new Promise<void>((resolve) => (releaseLoad = resolve));
            class SlowStorage extends ObservablePersistLocalStorage {
                async loadTable() {
                    await loadGate;
                }
            }
            const listCalls: Array<number | undefined> = [];
            const createCalls: BasicValue[] = [];
            const obs$ = observable<Record<string, BasicValue>>(
                syncedCrud<BasicValue>({
                    initial: {},
                    syncMode,
                    mode: 'merge',
                    list: ({ lastSync }) => {
                        listCalls.push(lastSync);
                        return [];
                    },
                    create: async (input) => {
                        createCalls.push(input);
                        return { ...input, updatedAt: 18 };
                    },
                    fieldUpdatedAt: 'updatedAt',
                    changesSince: 'last-sync',
                    persist: { name: persistName, plugin: SlowStorage, retrySync: true },
                }),
            );
            obs$.get();
            const state$ = syncState(obs$);
            const earlySync = state$.sync();
            expect(listCalls).toEqual([]);
            expect(createCalls).toEqual([]);
            releaseLoad();
            await earlySync;
            await when(state$.isPersistLoaded);
            await promiseTimeout(20);
            expect(createCalls).toHaveLength(1);
            expect(listCalls).toHaveLength(syncMode === 'manual' ? 1 : 2);
            expect(listCalls.every((lastSync) => lastSync === 17)).toBe(true);
            expect(createCalls[0]).toEqual(stored.id1);
            expect(obs$.id1.peek()).toEqual({ ...stored.id1, updatedAt: 18 });
            expect(state$.getPendingChanges()).toEqual({});
            expect(JSON.parse(localStorage.getItem(persistName + '__m')!).pending).toEqual({});
            await state$.sync();
            await promiseTimeout(0);
            expect(createCalls).toHaveLength(1);
        },
    );
    test('explicit child sync waits for ancestor persistence', async () => {
        let releaseLoad!: () => void;
        const loadGate = new Promise<void>((resolve) => (releaseLoad = resolve));
        class SlowStorage extends ObservablePersistLocalStorage {
            async loadTable() {
                await loadGate;
            }
        }
        let getCalls = 0;
        const parent$ = observable({
            child: synced({
                initial: 0,
                syncMode: 'manual',
                get: () => ++getCalls,
            }),
        });
        const parentState$ = syncObservable(parent$, {
            persist: { name: getPersistName(), plugin: SlowStorage },
        });
        parent$.child.get();
        const earlySync = syncState(parent$.child).sync();
        await promiseTimeout(0);
        expect(getCalls).toBe(0);
        releaseLoad();
        await earlySync;
        await when(parentState$.isPersistLoaded);
        expect(getCalls).toBe(1);
        expect(parent$.child.peek()).toBe(1);
    });
    test('subscription-only sync waits for persisted replay and lastSync', async () => {
        const name = getPersistName();
        localStorage.setItem(name, JSON.stringify({ n: 1 }));
        localStorage.setItem(
            name + '__m',
            JSON.stringify({ lastSync: 17, pending: { n: { p: 0, t: ['object'], v: 1 } } }),
        );
        let releaseLoad!: () => void;
        const loadGate = new Promise<void>((resolve) => (releaseLoad = resolve));
        class SlowStorage extends ObservablePersistLocalStorage {
            async loadTable() {
                await loadGate;
            }
        }
        const subscriptions: Array<number | undefined> = [];
        const writes: Array<{ n: number }> = [];
        const obs$ = observable(
            synced({
                initial: { n: 0 },
                syncMode: 'manual',
                subscribe: ({ lastSync, update }) => {
                    subscriptions.push(lastSync);
                    update({ value: { n: 0 }, lastSync: 18 });
                },
                set: async ({ value }) => {
                    writes.push(value);
                },
                persist: { name, plugin: SlowStorage, retrySync: true },
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        const earlySync = state$.sync();
        await promiseTimeout(0);
        expect(subscriptions).toEqual([]);
        releaseLoad();
        await earlySync;
        await promiseTimeout(20);
        expect(subscriptions).toEqual([17]);
        expect(writes).toEqual([{ n: 1 }]);
        expect(obs$.peek()).toEqual({ n: 1 });
        expect(state$.lastSync.peek()).toBe(18);
        expect(state$.getPendingChanges()).toEqual({});
        expect(JSON.parse(localStorage.getItem(name + '__m')!).pending).toEqual({});
        await state$.sync();
        await promiseTimeout(0);
        expect(subscriptions).toEqual([17]);
        expect(writes).toHaveLength(1);
    });
    test('concurrent early sync calls preserve dispatch order when resetting lastSync', async () => {
        const name = getPersistName();
        localStorage.setItem(name, JSON.stringify({ n: 1 }));
        localStorage.setItem(name + '__m', JSON.stringify({ lastSync: 17 }));
        let releaseLoad!: () => void;
        const loadGate = new Promise<void>((resolve) => (releaseLoad = resolve));
        class SlowStorage extends ObservablePersistLocalStorage {
            async loadTable() {
                await loadGate;
            }
        }
        const lastSyncCalls: Array<number | undefined> = [];
        const obs$ = observable(
            synced({
                initial: { n: 0 },
                syncMode: 'manual',
                get: ({ lastSync }) => {
                    lastSyncCalls.push(lastSync);
                    return { n: 2 };
                },
                persist: { name, plugin: SlowStorage },
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        const ordinarySync = state$.sync();
        const earlySync = state$.sync({ resetLastSync: true });
        await promiseTimeout(0);
        expect(lastSyncCalls).toEqual([]);
        releaseLoad();
        await Promise.all([ordinarySync, earlySync]);
        await promiseTimeout(0);
        expect(lastSyncCalls).toEqual([17, undefined]);
        expect(state$.lastSync.peek()).toBeUndefined();
        expect(obs$.peek()).toEqual({ n: 2 });
    });
    test('set-only sync replays pending writes after asynchronous persistence', async () => {
        const name = getPersistName();
        localStorage.setItem(name, JSON.stringify({ n: 1 }));
        localStorage.setItem(name + '__m', JSON.stringify({ pending: { n: { p: 0, t: ['object'], v: 1 } } }));
        let releaseLoad!: () => void;
        const loadGate = new Promise<void>((resolve) => (releaseLoad = resolve));
        class SlowStorage extends ObservablePersistLocalStorage {
            async loadTable() {
                await loadGate;
            }
        }
        const writes: Array<{ n: number }> = [];
        const obs$ = observable(
            synced({
                initial: { n: 0 },
                set: async ({ value }) => {
                    writes.push(value);
                },
                persist: { name, plugin: SlowStorage, retrySync: true },
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        state$.sync();
        await promiseTimeout(0);
        expect(writes).toEqual([]);
        releaseLoad();
        await when(state$.isPersistLoaded);
        await promiseTimeout(20);
        expect(writes).toEqual([{ n: 1 }]);
        expect(state$.getPendingChanges()).toEqual({});
        expect(JSON.parse(localStorage.getItem(name + '__m')!).pending).toEqual({});
        state$.sync();
        await promiseTimeout(0);
        expect(writes).toHaveLength(1);
        obs$.n.set(2);
        await promiseTimeout(20);
        expect(writes).toEqual([{ n: 1 }, { n: 2 }]);
        expect(state$.getPendingChanges()).toEqual({});
        expect(JSON.parse(localStorage.getItem(name + '__m')!).pending).toEqual({});
    });
    test('sync rechecks enabled state after waiting for persistence', async () => {
        let releaseLoad!: () => void;
        const loadGate = new Promise<void>((resolve) => (releaseLoad = resolve));
        class SlowStorage extends ObservablePersistLocalStorage {
            async loadTable() {
                await loadGate;
            }
        }
        let gets = 0;
        const obs$ = observable(
            synced({
                initial: 0,
                get: () => ++gets,
                persist: { name: getPersistName(), plugin: SlowStorage },
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        const earlySync = state$.sync();
        state$.isSyncEnabled.set(false);
        releaseLoad();
        await earlySync;
        expect(gets).toBe(1);
    });
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

describe('explicit sync() waits for the get (#334)', () => {
    test('waits for the get when observed', async () => {
        let numGets = 0;
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(5);
                    return ++numGets;
                },
            }),
        );
        const dispose = observe(() => obs$.get());
        const state$ = syncState(obs$);
        await when(state$.isLoaded);
        expect(obs$.peek()).toEqual(1);

        await state$.sync();

        expect(numGets).toEqual(2);
        expect(obs$.peek()).toEqual(2);
        expect(state$.isGetting.peek()).toEqual(false);
        dispose();
    });
    test('waits for the first get', async () => {
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(5);
                    return 'remote';
                },
            }),
        );
        const state$ = syncState(obs$);

        await state$.sync();

        expect(obs$.peek()).toEqual('remote');
        expect(state$.isLoaded.peek()).toEqual(true);
    });
    test('waits for the get', async () => {
        let numGets = 0;
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(5);
                    return ++numGets;
                },
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        await when(state$.isLoaded);
        expect(obs$.peek()).toEqual(1);

        await state$.sync();

        expect(numGets).toEqual(2);
        expect(obs$.peek()).toEqual(2);
        expect(state$.isGetting.peek()).toEqual(false);
    });
    test('resolves when the get fails', async () => {
        let numGets = 0;
        const errors: Error[] = [];
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(0);
                    if (++numGets > 1) throw new Error('get failed');
                    return numGets;
                },
                onError: (error) => errors.push(error),
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        await when(state$.isLoaded);

        await state$.sync();

        expect(numGets).toEqual(2);
        expect(errors.map((e) => e.message)).toEqual(['get failed']);
        expect(obs$.peek()).toEqual(1);
    });
    test('resolves when reset() runs during the get', async () => {
        let numGets = 0;
        const resolves: ((value: number) => void)[] = [];
        const obs$ = observable(
            synced({
                get: () => {
                    numGets++;
                    return numGets === 1 ? 1 : new Promise<number>((resolve) => resolves.push(resolve));
                },
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        await when(state$.isLoaded);

        let done = false;
        const promise = state$.sync().then(() => (done = true));
        await promiseTimeout(0);
        expect(numGets).toEqual(2);
        await state$.reset();
        await promise;
        expect(done).toEqual(true);
    });
    test('a dependency change stays lazy until the next get', async () => {
        const id$ = observable(1);
        let numGets = 0;
        const obs$ = observable(
            synced({
                get: () => {
                    numGets++;
                    return id$.get();
                },
            }),
        );
        expect(obs$.get()).toEqual(1);
        id$.set(2);
        await promiseTimeout(0);
        expect(numGets).toEqual(1);
        expect(obs$.get()).toEqual(2);
        expect(numGets).toEqual(2);
    });
});
