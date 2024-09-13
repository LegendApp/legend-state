import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import 'fake-indexeddb/auto';
import { event } from '../src/event';
import { observable } from '../src/observable';
import { Change } from '../src/observableInterfaces';
import type { Observable } from '../src/observableTypes';
import { observe } from '../src/observe';
import { configureSynced } from '../src/sync/configureSynced';
import { getAllSyncStates, syncObservable, transformSaveData } from '../src/sync/syncObservable';
import { syncState } from '../src/syncState';
import { when } from '../src/when';
import { ObservablePersistPlugin, SyncedOptions, synced } from '../sync';
import { BasicValue, ObservablePersistLocalStorage, getPersistName, localStorage, promiseTimeout } from './testglobals';
import { clone } from '../src/globals';

describe('Creating', () => {
    test('Loading state works correctly', async () => {
        const persistName = getPersistName();
        const nodes = observable<Record<string, { key: string }>>({});
        let lastSet;
        const state = syncObservable(nodes, {
            persist: {
                plugin: ObservablePersistLocalStorage,
                name: persistName,
            },
            get: async () => {
                const nodes = await new Promise<{ key: string }[]>((resolve) =>
                    setTimeout(() => resolve([{ key: 'key0' }]), 10),
                );
                return nodes.reduce(
                    (acc, node) => {
                        acc[node.key] = node;
                        return acc;
                    },
                    {} as Record<string, { key: string }>,
                );
            },
            set: async ({ value }: { value: any; changes: Change[] }) => {
                lastSet = value;
            },
        });

        await when(state.isPersistLoaded);
        await when(state.isLoaded);
        expect(lastSet).toEqual(undefined);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
    });
    test('syncObservable with synced as options', async () => {
        const persistName = getPersistName();
        const nodes = observable<Record<string, { key: string }>>({});
        let lastSet;
        const state = syncObservable(
            nodes,
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                get: async () => {
                    const nodes = await new Promise<{ key: string }[]>((resolve) =>
                        setTimeout(() => resolve([{ key: 'key0' }]), 10),
                    );
                    return nodes.reduce(
                        (acc, node) => {
                            acc[node.key] = node;
                            return acc;
                        },
                        {} as Record<string, { key: string }>,
                    );
                },
                set: async ({ value }: { value: any; changes: Change[] }) => {
                    lastSet = value;
                },
            }),
        );

        await when(state.isPersistLoaded);
        await when(state.isLoaded);
        expect(lastSet).toEqual(undefined);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
    });
    test('Throws error if observable is undefined', async () => {
        const nodes = undefined as unknown as Observable<Record<string, any>>;
        expect(() => {
            syncObservable(nodes, {
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: getPersistName(),
                },
            });
        }).toThrow('[legend-state] syncObservable called with undefined observable');
    });
});
describe('Transforming data', () => {
    test('transformOutData with transform', async () => {
        const { value } = await transformSaveData({ id: 'id', text: 'a' }, [], [], {
            transform: {
                save: (value) => {
                    value.text = 'b';
                    return value;
                },
            },
        });

        expect(value).toEqual({ id: 'id', text: 'b' });
    });
    test('transform load in synced', () => {
        const value = observable(
            synced({
                get: () => {
                    return { test: 'hi' };
                },
                transform: {
                    load: (value) => ({
                        test: value.test + '1',
                    }),
                },
            }),
        );

        expect(value.get()).toEqual({ test: 'hi1' });
    });
    test('transform save in synced', async () => {
        const setValue$ = observable<string | undefined>(undefined);
        const value = observable(
            synced({
                get: () => {
                    return { test: 'hi' };
                },
                set: ({ value }) => {
                    setValue$.set(value.test);
                },
                transform: {
                    load: (value) => ({
                        test: value.test + '1',
                    }),
                    save: (value) => ({
                        test: value.test.replace('1', '2'),
                    }),
                },
            }),
        );

        expect(value.get()).toEqual({ test: 'hi1' });

        value.test.set('hello1');

        expect(value.get()).toEqual({ test: 'hello1' });
        expect(await when(setValue$)).toEqual('hello2');
    });
    test('transform in persist', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ test: 'hi' }));
        const value = observable(
            synced({
                get: async () => {
                    await promiseTimeout(0);
                    return { test: 'hiz1' };
                },
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    transform: {
                        load: (value) => ({
                            test: value.test + '1',
                        }),
                        save: (value) => ({
                            test: value.test.replace('1', '2'),
                        }),
                    },
                },
            }),
        );

        expect(value.get()).toEqual({ test: 'hi1' });
        await when(() => value.get().test === 'hiz1');
        expect(value.get().test).toEqual('hiz1');

        value.test.set('hello1');
        expect(value.get().test).toEqual('hello1');
        await promiseTimeout(0);
        expect(localStorage.getItem(persistName)).toEqual('{"test":"hello2"}');
    });
    test('transform save in synced', async () => {
        const setValue$ = observable<string | undefined>(undefined);
        const value = observable(
            synced({
                get: () => {
                    return { test: 'hi' };
                },
                set: ({ value }) => {
                    setValue$.set(value.test);
                },
                transform: {
                    load: (value) => ({
                        test: value.test + '1',
                    }),
                    save: (value) => ({
                        test: value.test.replace('1', '2'),
                    }),
                },
            }),
        );

        expect(value.get()).toEqual({ test: 'hi1' });

        value.test.set('hello1');

        expect(value.get()).toEqual({ test: 'hello1' });
        expect(await when(setValue$)).toEqual('hello2');
    });
});
describe('Pending', () => {
    test('Pending created and updated', async () => {
        const persistName = getPersistName();
        let isOk = false;
        let didSetWrongValue = false;
        const obs$ = observable(
            synced({
                get: () => {
                    return { test: 'hi' };
                },
                set: ({ value }) => {
                    didSetWrongValue = value.test !== obs$.get().test;
                    expect(value.test).toEqual(obs$.get().test);
                    if (!isOk) {
                        throw new Error('Did not save' + value);
                    }
                },
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                retry: {
                    times: 2,
                    delay: 1,
                    backoff: 'constant',
                },
            }),
        );

        const state$ = syncState(obs$);

        // Sets pending
        obs$.test.set('hello');
        await promiseTimeout(0);
        let pending = state$.getPendingChanges();
        expect(pending).toEqual({ test: { p: 'hi', t: ['object'], v: 'hello' } });

        // Updates pending
        obs$.test.set('hello2');
        await promiseTimeout(0);
        expect(didSetWrongValue).toEqual(false);

        pending = state$.getPendingChanges();
        expect(pending).toEqual({ test: { p: 'hi', t: ['object'], v: 'hello2' } });

        // Let it save
        isOk = true;

        await promiseTimeout(10);

        pending = state$.getPendingChanges();
        expect(pending).toEqual({});

        isOk = false;

        // Nothing changed
        obs$.test.set('hello2');

        await promiseTimeout(0);
        pending = state$.getPendingChanges();
        expect(pending).toEqual({});

        // Changed again
        obs$.test.set('hello');

        await promiseTimeout(0);
        pending = state$.getPendingChanges();
        expect(pending).toEqual({ test: { p: 'hello2', t: ['object'], v: 'hello' } });

        // Let it save
        isOk = true;

        await promiseTimeout(10);

        pending = state$.getPendingChanges();
        expect(pending).toEqual({});
        expect(didSetWrongValue).toEqual(false);
    });
    test('Pending applied if changed', async () => {
        const persistName = getPersistName();
        const obs$ = observable(
            synced({
                get: () => {
                    return { test: { text: 'hi' } };
                },
                set: ({ value }) => {
                    throw new Error('Did not save' + value);
                },
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                    retrySync: true,
                },
            }),
        );

        obs$.get();

        const state$ = syncState(obs$);

        // Sets pending
        obs$.test.set({ text: 'hello' });
        await promiseTimeout(0);
        const pending = state$.getPendingChanges();
        expect(pending).toEqual({ test: { p: { text: 'hi' }, t: ['object'], v: { text: 'hello' } } });

        // Copy pending to new one to emulate reload
        const persistName2 = getPersistName();
        localStorage.setItem(persistName2, localStorage.getItem(persistName)!);
        localStorage.setItem(persistName2 + '__m', localStorage.getItem(persistName + '__m')!);

        let valueSetTo = undefined;
        const didSet$ = observable(false);
        const obs2$ = observable(
            synced({
                get: () => {
                    return { test: { text: 'hi' } };
                },
                set: ({ value, update }) => {
                    valueSetTo = value;
                    update({ value });
                    didSet$.set(true);
                },
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName2,
                    retrySync: true,
                },
            }),
        );

        const state2$ = syncState(obs2$);

        obs2$.get();

        await when(didSet$);
        await promiseTimeout(0);

        // Should have deleted the pending because it's the same
        const pending2 = state2$.getPendingChanges();
        expect(pending2).toEqual({});

        expect(valueSetTo).toEqual({ test: { text: 'hello' } });
    });
    test('Pending removed if already equal', async () => {
        const persistName = getPersistName();
        const obs$ = observable(
            synced({
                get: () => {
                    return { test: { text: 'hi' } };
                },
                set: ({ value }) => {
                    throw new Error('Did not save' + value);
                },
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                    retrySync: true,
                },
            }),
        );

        obs$.get();

        const state$ = syncState(obs$);

        // Sets pending
        obs$.test.set({ text: 'hello' });
        await promiseTimeout(0);
        const pending = state$.getPendingChanges();
        expect(pending).toEqual({ test: { p: { text: 'hi' }, t: ['object'], v: { text: 'hello' } } });

        // Copy pending to new one to emulate reload
        const persistName2 = getPersistName();
        localStorage.setItem(persistName2, localStorage.getItem(persistName)!);
        localStorage.setItem(persistName2 + '__m', localStorage.getItem(persistName + '__m')!);

        const obs2$ = observable(
            synced({
                get: () => {
                    return { test: { text: 'hello' } };
                },
                set: ({ value }) => {
                    throw new Error('Did not save' + value);
                },
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName2,
                    retrySync: true,
                },
            }),
        );

        const state2$ = syncState(obs2$);

        obs2$.get();
        await promiseTimeout(0);

        // Should have deleted the pending because it's the same
        const pending2 = state2$.getPendingChanges();
        expect(pending2).toEqual({});
    });
    test('set to same as previous removes from remote changes', async () => {
        let didSave = false;
        const obs$ = observable(
            synced({
                get: () => {
                    return 'hi';
                },
                set: () => {
                    didSave = true;
                },
            }),
        );

        obs$.set('hello');
        obs$.set('hi');

        await promiseTimeout(0);

        expect(didSave).toEqual(false);
    });
    test('pending without a get', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, '{"test":"hi"}');
        localStorage.setItem(persistName + '__m', '{"pending":{"":{"p":{"test":"hello"},"t":[],"v":{"test":"hi"}}}}');
        const obs$ = observable({});
        const saved$ = observable(undefined);
        syncObservable(obs$, {
            set: ({ value }) => {
                saved$.set(value);
            },
            persist: {
                name: persistName,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({ test: 'hi' });
        expect(syncState(obs$).isLoaded.get()).toEqual(true);

        await promiseTimeout(0);

        expect(await when(saved$)).toEqual({ test: 'hi' });
    });
});
describe('sync state', () => {
    test('isGetting and isSetting', async () => {
        const canSet$ = observable(false);
        const obs$ = observable(
            synced({
                get: () => {
                    return promiseTimeout(1, 'hi');
                },
                set: async () => {
                    await when(canSet$);
                },
            }),
        );
        const state$ = syncState(obs$);

        expect(state$.isGetting.get()).toEqual(false);
        expect(obs$.get()).toEqual(undefined);
        expect(state$.isGetting.get()).toEqual(true);
        await promiseTimeout(1);
        expect(state$.isGetting.get()).toEqual(false);
        expect(obs$.get()).toEqual('hi');

        obs$.set('hello');

        await when(state$.isSetting);

        expect(state$.numPendingSets.get()).toEqual(1);
        expect(state$.isSetting.get()).toEqual(true);
        canSet$.set(true);
        await promiseTimeout(1);
        expect(state$.isSetting.get()).toEqual(false);
    });
});
describe('persist objects', () => {
    test('persist object with functions', async () => {
        const persistName = getPersistName();
        const draftBom$ = observable({
            items: [] as string[],
            addItem(item: string) {
                const newItems = Array.from(new Set(draftBom$.items.get()).add(item));
                draftBom$.items.set(newItems);
            },
            deleteItem(item: string) {
                const newItems = draftBom$.items.get().filter((i) => i !== item);
                draftBom$.items.set(newItems);
            },
        });
        syncObservable(draftBom$, {
            persist: {
                plugin: ObservablePersistLocalStorage,
                name: persistName,
            },
        });

        draftBom$.addItem('hi');

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);
        expect(localValue).toBe(`{"items":["hi"]}`);

        const addItem = (item: string) => {
            const newItems = Array.from(new Set(draftBom$.items.get()).add(item));
            draftBom$.items.set(newItems);
        };
        const deleteItem = (item: string) => {
            const newItems = draftBom$.items.get().filter((i) => i !== item);
            draftBom$.items.set(newItems);
        };

        const draftBom2$ = observable({
            items: [] as string[],
            addItem,
            deleteItem,
        });
        syncObservable(draftBom2$, {
            persist: {
                plugin: ObservablePersistLocalStorage,
                name: persistName,
            },
        });

        expect(JSON.stringify(draftBom2$.get())).toEqual(JSON.stringify({ addItem, deleteItem, items: ['hi'] }));
    });
    test('Map merges from persistence correctly', async () => {
        interface TableState {
            columnFilters: any;
            sorting: any;
            pagination: any;
            search: string;
        }

        const initial = {
            columnFilters: 'hi1',
            sorting: ['hi2'],
            pagination: { hi3: 'hi4' },
            search: 'hi5',
        };

        const tablesState$ = observable({
            tables: new Map<string, TableState>([['XX', initial]]),
        });

        const myPersist = configureSynced(synced, {
            persist: {
                plugin: ObservablePersistLocalStorage,
            },
        });

        const persistName = getPersistName();

        syncObservable(
            tablesState$,
            myPersist({
                persist: {
                    name: persistName,
                },
            }),
        );

        expect(tablesState$.get()).toEqual({
            tables: new Map([['XX', clone(initial)]]),
        });

        tablesState$.tables.get('XX').sorting.set([]);

        expect(tablesState$.get()).toEqual({
            tables: new Map([['XX', clone(initial)]]),
        });

        await promiseTimeout(0);

        expect(localStorage.getItem(persistName)).toEqual(
            '{"tables":{"__LSType":"Map","value":[["XX",{"columnFilters":"hi1","sorting":[],"pagination":{"hi3":"hi4"},"search":"hi5"}]]}}',
        );

        const tablesState2$ = observable({
            tables: new Map<string, TableState>([['XX', clone(initial)]]),
        });
        syncObservable(
            tablesState2$,
            myPersist({
                persist: {
                    name: persistName,
                },
            }),
        );

        expect(tablesState2$.get()).toEqual({
            tables: new Map([['XX', clone(initial)]]),
        });
    });
    test('Map merges from persistence correctly', async () => {
        const obs$ = observable({
            m: new Map([
                ['v1', { h1: 'h1', h2: [] }],
                ['v2', { h1: 'h3', h2: [1] }],
            ]),
        });

        const mySynced = configureSynced(synced, {
            persist: {
                plugin: ObservablePersistLocalStorage,
            },
        });

        const persistName = getPersistName();

        syncObservable(
            obs$,
            mySynced({
                persist: {
                    name: persistName,
                },
            }),
        );

        expect(obs$.get()).toEqual({
            m: new Map([
                ['v1', { h1: 'h1', h2: [] }],
                ['v2', { h1: 'h3', h2: [1] }],
            ]),
        });

        // Set h2 on v2
        obs$.m.get('v2').h2.set([]);

        expect(obs$.get()).toEqual({
            m: new Map([
                ['v1', { h1: 'h1', h2: [] }],
                ['v2', { h1: 'h3', h2: [] }],
            ]),
        });

        await promiseTimeout(0);

        expect(localStorage.getItem(persistName)).toEqual(
            '{"m":{"__LSType":"Map","value":[["v1",{"h1":"h1","h2":[]}],["v2",{"h1":"h3","h2":[]}]]}}',
        );

        const obs2$ = observable({
            m: new Map([
                ['v1', { h1: 'h1', h2: [] }],
                ['v2', { h1: 'h3', h2: [1] }],
            ]),
        });
        syncObservable(
            obs2$,
            mySynced({
                persist: {
                    name: persistName,
                },
            }),
        );

        expect(obs2$.get()).toEqual({
            m: new Map([
                ['v1', { h1: 'h1', h2: [] }],
                ['v2', { h1: 'h3', h2: [] }],
            ]),
        });
    });
});
describe('get mode', () => {
    test('synced get sets by default', async () => {
        const obs$ = observable(
            synced<Record<string, string>>({
                get: () => promiseTimeout(1, { key1: 'hi', key2: 'hi' }),
                initial: { key0: 'hello' },
            }),
        );

        expect(obs$.get()).toEqual({ key0: 'hello' });
        await promiseTimeout(1);
        expect(obs$.get()).toEqual({ key1: 'hi', key2: 'hi' });
    });
    test('synced get assigns with option', async () => {
        const obs$ = observable(
            synced<Record<string, string>>({
                get: () => promiseTimeout(1, { key1: 'hi', key2: 'hi' }),
                initial: { key0: 'hello' },
                mode: 'assign',
            }),
        );

        expect(obs$.get()).toEqual({ key0: 'hello' });
        await promiseTimeout(1);
        expect(obs$.get()).toEqual({ key0: 'hello', key1: 'hi', key2: 'hi' });
    });
    test('synced get merges with option', async () => {
        const obs$ = observable(
            synced<Record<string, any>>({
                get: () => promiseTimeout(1, { key1: 'hi', key2: 'hi', obj: { a: true, c: true } }),
                initial: { key0: 'hello', obj: { a: false, b: true } },
                mode: 'merge',
            }),
        );

        expect(obs$.get()).toEqual({ key0: 'hello', obj: { a: false, b: true } });
        await promiseTimeout(1);
        expect(obs$.get()).toEqual({ key0: 'hello', key1: 'hi', key2: 'hi', obj: { a: true, b: true, c: true } });
    });
    test('synced get assigns with setMode', async () => {
        const obs$ = observable(
            synced<Record<string, string>>({
                get: (params) => {
                    params.mode = 'assign';
                    return promiseTimeout(1, { key1: 'hi', key2: 'hi' });
                },
                initial: { key0: 'hello' },
            }),
        );

        expect(obs$.get()).toEqual({ key0: 'hello' });
        await promiseTimeout(1);
        expect(obs$.get()).toEqual({ key0: 'hello', key1: 'hi', key2: 'hi' });
    });
    test('linked setting mode overrides option', async () => {
        const obs$ = observable(
            synced<Record<string, any>>({
                get: (params) => {
                    params.mode = 'merge';
                    return promiseTimeout(1, { key1: 'hi', key2: 'hi', obj: { a: true, c: true } });
                },
                initial: { key0: 'hello', obj: { a: false, b: true } },
                mode: 'assign',
            }),
        );

        // Expect it should merge
        expect(obs$.get()).toEqual({ key0: 'hello', obj: { a: false, b: true } });
        await promiseTimeout(1);
        expect(obs$.get()).toEqual({ key0: 'hello', key1: 'hi', key2: 'hi', obj: { a: true, b: true, c: true } });
    });
});
describe('global config', () => {
    test('takes global config persist changes', async () => {
        let setTo: any = undefined;
        const didSet$ = observable(false);
        const mySynced = configureSynced(synced, {
            persist: {
                retrySync: true,
                plugin: ObservablePersistLocalStorage,
            },
        });

        const persistName = getPersistName();
        const obs$ = observable(
            mySynced({
                get: async () => {
                    await promiseTimeout(0);
                    return { test: false };
                },
                set: async ({ value }) => {
                    setTo = value;
                    didSet$.set(true);
                    // TODO Should this work instead of throwing?
                    // return Promise.reject();
                    throw new Error();
                },
                persist: {
                    name: persistName,
                },
            }),
        );

        obs$.get();

        await when(syncState(obs$).isLoaded);

        obs$.set({ test: true });

        await when(didSet$);

        expect(setTo).toEqual({ test: true });

        expect(localStorage.getItem(persistName)).toEqual('{"test":true}');
        // Ensure pending to check retrySync worked
        expect(localStorage.getItem(persistName + '__m')).toEqual(
            '{"pending":{"":{"p":{"test":false},"t":[],"v":{"test":true}}}}',
        );
    });
});

describe('clear persist', () => {
    test('clear individual persist', async () => {
        const persistName = getPersistName();
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(0);
                    return { test: false };
                },
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        obs$.get();

        await when(syncState(obs$).isLoaded);
        await promiseTimeout(1);

        expect(localStorage.getItem(persistName)).toEqual('{"test":false}');

        const state$ = syncState(obs$);
        state$.resetPersistence();

        expect(localStorage.getItem(persistName)).toEqual(null);
    });
    test('clear all persists', async () => {
        const persistName = getPersistName();
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(0);
                    return { test: false };
                },
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        obs$.get();

        await when(syncState(obs$).isLoaded);
        await promiseTimeout(1);

        expect(localStorage.getItem(persistName)).toEqual('{"test":false}');

        const states$ = getAllSyncStates();
        states$.forEach(([state$]) => state$.resetPersistence());

        expect(localStorage.getItem(persistName)).toEqual(null);
    });
});

describe('reset sync state', () => {
    test('reset individual sync state', async () => {
        const persistName = getPersistName();
        let numGets = 0;
        let lastLastSync: number | undefined = undefined;
        const obs$ = observable(
            synced({
                get: async ({ lastSync, updateLastSync }) => {
                    lastLastSync = lastSync;
                    numGets++;
                    await promiseTimeout(0);
                    updateLastSync(10);
                    return { test: numGets };
                },
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
                initial: { test: 0 },
            }),
        );

        obs$.get();

        const state$ = syncState(obs$);
        await when(state$.isLoaded);
        await promiseTimeout(1);

        expect(lastLastSync).toEqual(undefined);
        expect(numGets).toEqual(1);
        expect(localStorage.getItem(persistName)).toEqual('{"test":1}');

        await state$.sync();

        expect(lastLastSync).toEqual(10);
        expect(numGets).toEqual(2);

        state$.reset();

        expect(localStorage.getItem(persistName)).toEqual(null);
        expect(obs$.get()).toEqual({ test: 0 });
        expect(state$.isLoaded.get()).toEqual(false);

        obs$.get();

        await when(state$.isLoaded);
        await promiseTimeout(1);

        expect(lastLastSync).toEqual(undefined);

        expect(numGets).toEqual(3);
        expect(localStorage.getItem(persistName)).toEqual('{"test":3}');
    });
});

describe('multiple persists', () => {
    test('saves to multiple persists with two syncObservable', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        const obs$ = observable({});
        syncObservable(obs$, {
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        obs$.set({ test: 'hi' });
        await promiseTimeout(0);

        expect(localStorage.getItem(persistName1)).toEqual('{"test":"hi"}');
        expect(localStorage.getItem(persistName2)).toEqual('{"test":"hi"}');
    });
    test('saves to multiple persists with synced and syncObservable', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        const obs$ = observable(
            synced({
                initial: {},
                persist: {
                    name: persistName1,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        syncObservable(obs$, {
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        obs$.set({ test: 'hi' });
        await promiseTimeout(0);

        expect(localStorage.getItem(persistName1)).toEqual('{"test":"hi"}');
        expect(localStorage.getItem(persistName2)).toEqual('{"test":"hi"}');
    });
    test('loads from multiple persists with two syncObservable /1', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        localStorage.setItem(persistName1, '{"test":"hi"}');
        const obs$ = observable({});
        syncObservable(obs$, {
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({ test: 'hi' });
    });
    test('loads from multiple persists with two syncObservable /2', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        localStorage.setItem(persistName2, '{"test":"hi"}');
        const obs$ = observable({});
        syncObservable(obs$, {
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({ test: 'hi' });
    });
    test('loads from multiple persists with two syncObservable with diff data', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        localStorage.setItem(persistName1, '{"test":"hello"}');
        localStorage.setItem(persistName2, '{"test":"hi"}');
        const obs$ = observable({});
        syncObservable(obs$, {
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({ test: 'hi' });
    });
    test('loads from one remote with two syncObservable', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        const obs$ = observable();
        syncObservable(obs$, {
            get: () => promiseTimeout(0, { test: 'hi' }),
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual(undefined);
        expect(syncState(obs$).isLoaded.get()).toEqual(false);

        await promiseTimeout(0);

        expect(obs$.get()).toEqual({ test: 'hi' });
    });
    test('gets from two remotes with two syncObservable', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        const obs$ = observable<BasicValue>();
        syncObservable(obs$, {
            get: () => promiseTimeout(0, { test: 'hi' }),
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            get: () => promiseTimeout(10, { test: 'hello' }),
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual(undefined);
        const state$ = syncState(obs$);
        expect(state$.isLoaded.get()).toEqual(false);

        await promiseTimeout(0);

        expect(obs$.get()).toEqual({ test: 'hi' });
        expect(state$.isLoaded.get()).toEqual(false);

        await promiseTimeout(10);

        expect(obs$.get()).toEqual({ test: 'hello' });
        expect(state$.isLoaded.get()).toEqual(true);
    });
    test('saves to second remote with two syncObservable', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        const obs$ = observable<BasicValue>();
        const saved$ = observable(undefined);
        syncObservable(obs$, {
            get: () => promiseTimeout(0, { test: 'hi' }),
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            set: ({ value }) => {
                saved$.set(value);
            },
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual(undefined);
        expect(syncState(obs$).isLoaded.get()).toEqual(false);

        await promiseTimeout(0);

        expect(obs$.get()).toEqual({ test: 'hi' });

        obs$.test.set('hello');

        await promiseTimeout(0);

        expect(await when(saved$)).toEqual({ test: 'hello' });
    });
    test('saves to two remotes with two syncObservable', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        const obs$ = observable<BasicValue>();
        const saved1$ = observable(undefined);
        const saved2$ = observable(undefined);
        syncObservable(obs$, {
            get: () => promiseTimeout(0, { test: 'hi' }),
            set: ({ value }) => {
                saved1$.set(value);
            },
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            set: ({ value }) => {
                saved2$.set(value);
            },
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual(undefined);
        expect(syncState(obs$).isLoaded.get()).toEqual(false);

        await promiseTimeout(0);

        expect(obs$.get()).toEqual({ test: 'hi' });

        obs$.test.set('hello');

        await promiseTimeout(0);

        expect(await when(saved1$)).toEqual({ test: 'hello' });
        expect(await when(saved2$)).toEqual({ test: 'hello' });
    });
    test('loads from multiple persists with two syncObservable with no data in second /1', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        localStorage.setItem(persistName1, '{"test":"hi"}');
        localStorage.setItem(persistName2, '{}');
        localStorage.setItem(persistName1 + '__m', '{"pending":{"":{"p":{"test":"hello"},"t":[],"v":{"test":"hi"}}}}');
        const obs$ = observable({});
        const saved1$ = observable(undefined);
        const saved2$ = observable(undefined);
        syncObservable(obs$, {
            get: () => promiseTimeout(0, { test: 'hi' }),
            set: ({ value }) => {
                saved1$.set(value);
            },
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            set: ({ value }) => {
                saved2$.set(value);
            },
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({ test: 'hi' });
        expect(syncState(obs$).isLoaded.get()).toEqual(false);

        await promiseTimeout(0);

        expect(await when(saved1$)).toEqual({ test: 'hi' });
        expect(saved2$.peek()).toEqual(undefined);
    });
    test('loads from multiple persists with two syncObservable with no data in second /2', async () => {
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        localStorage.setItem(persistName1, '{"test":"hi"}');
        localStorage.setItem(persistName2, '{"test":"hi"}');
        localStorage.setItem(persistName2 + '__m', '{"pending":{"":{"p":{"test":"hello"},"t":[],"v":{"test":"hi"}}}}');
        const obs$ = observable({});
        const saved1$ = observable(undefined);
        const saved2$ = observable(undefined);
        syncObservable(obs$, {
            get: () => promiseTimeout(0, { test: 'hi' }),
            set: ({ value }) => {
                saved1$.set(value);
            },
            persist: {
                name: persistName1,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);
        syncObservable(obs$, {
            set: ({ value }) => {
                saved2$.set(value);
            },
            persist: {
                name: persistName2,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({ test: 'hi' });
        expect(syncState(obs$).isLoaded.get()).toEqual(false);

        await promiseTimeout(0);

        expect(await when(saved2$)).toEqual({ test: 'hi' });
        expect(saved1$.peek()).toEqual(undefined);
    });
    test('loads from multiple persists with async initialize', async () => {
        class StorageWithAsync extends ObservablePersistLocalStorage implements ObservablePersistPlugin {
            public initialize(): Promise<void> {
                return promiseTimeout(0);
            }
        }
        const persistName1 = getPersistName();
        const persistName2 = getPersistName();
        localStorage.setItem(persistName1, '{"test":"hi"}');
        localStorage.setItem(persistName2, '{"test":"hi"}');
        localStorage.setItem(persistName2 + '__m', '{"pending":{"":{"p":{"test":"hello"},"t":[],"v":{"test":"hi"}}}}');
        const obs$ = observable({});
        const saved1$ = observable(undefined);
        const saved2$ = observable(undefined);

        syncObservable(obs$, {
            get: () => promiseTimeout(0, { test: 'hello' }),
            set: ({ value }) => {
                saved1$.set(value);
            },
            persist: {
                name: persistName1,
                plugin: StorageWithAsync,
            },
        } as SyncedOptions);
        expect(syncState(obs$).isLoaded.get()).toEqual(false);
        syncObservable(obs$, {
            set: ({ value }) => {
                saved2$.set(value);
            },
            persist: {
                name: persistName2,
                plugin: StorageWithAsync,
            },
        } as SyncedOptions);

        await when(syncState(obs$).isPersistLoaded);

        expect(syncState(obs$).isLoaded.get()).toEqual(false);
        expect(obs$.get()).toEqual({ test: 'hi' });
        expect(syncState(obs$).isLoaded.get()).toEqual(false);

        await when(syncState(obs$).isLoaded);

        expect(syncState(obs$).isLoaded.get()).toEqual(true);
        expect(obs$.get()).toEqual({ test: 'hello' });
    });
});
describe('onBeforeGet', () => {
    test('reset cache in onBeforeGet', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, '{"id1":{"id":"id1","test":"hi"},"id2":{"id":"id2","test":"hello"}}');
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs$ = observable();
        syncObservable(obs$, {
            get: () => ({
                id3: {
                    id: 'id3',
                    test: 'yo',
                },
            }),
            mode: 'merge',
            onBeforeGet: ({ lastSync, resetCache }) => {
                if (lastSync! > 0) {
                    resetCache();
                }
            },
            persist: {
                name: persistName,
                plugin: ObservablePersistLocalStorage,
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({ id3: { id: 'id3', test: 'yo' } });
    });
});
describe('isSyncEnabled', () => {
    test('isSyncEnabled disables get and set', async () => {
        const obs$ = observable<Record<string, { id: string; test: string }>>();
        const ev$ = event();
        let gets = 0;
        const sets$ = observable(0);
        const state$ = syncObservable(obs$, {
            get: () => {
                gets++;
                ev$.get();
                return {
                    id1: {
                        id: 'id1',
                        test: 'hi',
                    },
                };
            },
            set: () => {
                sets$.set((v) => v + 1);
            },
        } as SyncedOptions);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
        });
        expect(gets).toEqual(1);
        expect(sets$.get()).toEqual(0);

        obs$.id1.test.set('hello');

        await when(() => sets$.get() === 1);

        expect(gets).toEqual(1);
        expect(sets$.get()).toEqual(1);

        ev$.fire();
        obs$.get();

        expect(gets).toEqual(2);
        expect(sets$.get()).toEqual(1);

        state$.isSyncEnabled.set(false);

        obs$.id1.test.set('yo');

        await promiseTimeout(0);

        expect(gets).toEqual(2);
        expect(sets$.get()).toEqual(1);

        ev$.fire();

        expect(gets).toEqual(2);
        expect(sets$.get()).toEqual(1);
    });
});
describe('synced is observer', () => {
    test('synced runs once when not calling get', () => {
        const num$ = observable(0);
        let runs = 0;
        const obs$ = observable(() =>
            synced({
                get: () => {
                    runs++;
                    return runs;
                },
            }),
        );
        expect(obs$.get()).toEqual(1);
        expect(runs).toEqual(1);
        num$.set(1);
        expect(obs$.get()).toEqual(1);
        expect(runs).toEqual(1);
    });
    test('synced is observer', () => {
        const num$ = observable(0);
        let runs = 0;
        const obs$ = observable(() =>
            synced({
                get: () => {
                    runs++;
                    return num$.get();
                },
            }),
        );
        expect(obs$.get()).toEqual(0);
        expect(runs).toEqual(1);
        num$.set(1);
        expect(obs$.get()).toEqual(1);
        expect(runs).toEqual(2);
    });
    test('synced is observer (2)', () => {
        const num$ = observable(0);
        let runs = 0;
        const obs$ = observable(() =>
            synced({
                get: () => {
                    runs++;
                    return num$.get();
                },
            }),
        );
        let latestValue = 0;
        observe(() => {
            latestValue = obs$.get();
        });
        expect(obs$.get()).toEqual(0);
        expect(latestValue).toEqual(0);
        expect(runs).toEqual(1);
        num$.set(1);
        expect(obs$.get()).toEqual(1);
        expect(latestValue).toEqual(1);
        expect(runs).toEqual(2);
    });
    test('syncObservable is observer', () => {
        const num$ = observable(0);
        let runs = 0;
        const obs$ = observable();
        syncObservable(
            obs$,
            synced({
                get: () => {
                    runs++;
                    return num$.get();
                },
            }),
        );
        expect(obs$.get()).toEqual(0);
        expect(runs).toEqual(1);
        num$.set(1);
        expect(obs$.get()).toEqual(1);
        expect(runs).toEqual(2);
    });
    test('syncedCrud is observer', async () => {
        const num$ = observable(0);
        let runs = 0;
        const obs$ = observable(
            syncedCrud({
                list: () => {
                    runs++;
                    return [{ id: 'id1', num: num$.get() }];
                },
                as: 'object',
            }),
        );
        let latestValue = 0;
        observe(() => {
            latestValue = obs$.id1.num.get();
        });

        await promiseTimeout(0);
        expect(obs$.id1.num.get()).toEqual(0);
        expect(latestValue).toEqual(0);
        expect(runs).toEqual(1);
        num$.set(1);
        expect(runs).toEqual(2);
        await promiseTimeout(0);
        expect(obs$.id1.num.get()).toEqual(1);
        expect(latestValue).toEqual(1);
    });
});
describe('acting like query', () => {
    test('query shape', () => {
        const profile$ = observable({
            data: synced({
                get: () => ({ test: 'hi' }),
            }),
            state: () => syncState(profile$.data),
        });
        expect(profile$.data.get()).toEqual({ test: 'hi' });
        expect(profile$.state.isLoaded.get()).toEqual(true);
    });
});
