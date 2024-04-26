import 'fake-indexeddb/auto';
import { observable, syncState } from '../src/observable';
import { Change } from '../src/observableInterfaces';
import { ObservablePersistLocalStorageBase } from '../src/persist-plugins/local-storage';
import { syncObservable, transformSaveData } from '../src/sync/syncObservable';
import { when } from '../src/when';
import { synced } from '../sync';
import { getPersistName, mockLocalStorage, promiseTimeout } from './testglobals';

const localStorage = mockLocalStorage();
class ObservablePersistLocalStorage extends ObservablePersistLocalStorageBase {
    constructor() {
        super(localStorage);
    }
}

describe('Creating', () => {
    test('Loading state works correctly', async () => {
        const nodes = observable<Record<string, { key: string }>>({});
        let lastSet;
        const state = syncObservable(nodes, {
            persist: {
                plugin: ObservablePersistLocalStorage,
                name: 'nodes',
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
        const nodes = observable<Record<string, { key: string }>>({});
        let lastSet;
        const state = syncObservable(
            nodes,
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: 'nodes',
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
});

describe('Adjusting data', () => {
    test('transformOutData with transform', () => {
        const adjusted = transformSaveData({ id: 'id', text: 'a' }, [], [], {
            transform: {
                save: (value) => {
                    value.text = 'b';
                    return value;
                },
            },
        });

        expect(adjusted).toEqual({ id: 'id', text: 'b' });
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
        const persistName = 'load1';
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
        const obs$ = observable(
            synced({
                get: () => {
                    return { test: 'hi' };
                },
                set: ({ value }) => {
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
                },
                offlineBehavior: 'retry',
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
                },
                offlineBehavior: 'retry',
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
                },
                offlineBehavior: 'retry',
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
                },
                offlineBehavior: 'retry',
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
                get: ({ setMode }) => {
                    setMode('assign');
                    return promiseTimeout(1, { key1: 'hi', key2: 'hi' });
                },
                initial: { key0: 'hello' },
            }),
        );

        expect(obs$.get()).toEqual({ key0: 'hello' });
        await promiseTimeout(1);
        expect(obs$.get()).toEqual({ key0: 'hello', key1: 'hi', key2: 'hi' });
    });
    test('linked setMode overrides option', async () => {
        const obs$ = observable(
            synced<Record<string, any>>({
                get: ({ setMode }) => {
                    setMode('merge');
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
