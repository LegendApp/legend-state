import 'fake-indexeddb/auto';
import { ObservableCacheLocalStorageBase } from '../src/cache-plugins/local-storage';
import { observable } from '../src/observable';
import { Change } from '../src/observableInterfaces';
import { syncObservable, transformSaveData } from '../src/sync/syncObservable';
import { when } from '../src/when';
import { synced } from '../sync';
import { mockLocalStorage, promiseTimeout } from './testglobals';

const localStorage = mockLocalStorage();
class ObservableCacheLocalStorage extends ObservableCacheLocalStorageBase {
    constructor() {
        super(localStorage);
    }
}

describe('Creating', () => {
    test('Loading state works correctly', async () => {
        const nodes = observable<Record<string, { key: string }>>({});
        let lastSet;
        const state = syncObservable(nodes, {
            cache: {
                plugin: ObservableCacheLocalStorage,
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

        await when(state.isLoadedLocal);
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
    test('transform in cache', async () => {
        const cacheName = 'load1';
        localStorage.setItem(cacheName, JSON.stringify({ test: 'hi' }));
        const value = observable(
            synced({
                get: async () => {
                    await promiseTimeout(0);
                    return { test: 'hiz1' };
                },
                cache: {
                    name: cacheName,
                    plugin: ObservableCacheLocalStorage,
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
        expect(localStorage.getItem(cacheName)).toEqual('{"test":"hello2"}');
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
