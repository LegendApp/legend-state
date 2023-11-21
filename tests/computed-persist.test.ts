import { persistObservable } from '../persist';
import { activated } from '../src/activated';
import { observable, syncState } from '../src/observable';
import { ObservablePersistLocalStorage } from '../src/persist-plugins/local-storage';
import { when } from '../src/when';
import { run } from './computedtests';
import { mockLocalStorage, promiseTimeout } from './testglobals';

persistObservable({} as any, {
    pluginRemote: {
        get() {
            return Promise.resolve({ test: 'hi' });
        },
    },
});

run(true);

mockLocalStorage();

describe('caching with new computed', () => {
    test('cache basic', async () => {
        localStorage.setItem('nodesbasic', JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'nodesbasic',
                },
                get: async () => {
                    const nodes = await new Promise<{ key: string }[]>((resolve) =>
                        setTimeout(() => resolve([{ key: 'key1' }]), 10),
                    );
                    return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                        acc[node.key] = node;
                        return acc;
                    }, {});
                },
            }),
        );

        const state = syncState(nodes);

        expect(state.isLoadedLocal.get()).toEqual(true);
        expect(state.isLoaded.get()).toEqual(false);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await when(state.isLoaded);
        expect(nodes.get()).toEqual({ key1: { key: 'key1' } });
    });
    test('cache with no delay', async () => {
        localStorage.setItem('nodesdelay', JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'nodesdelay',
                },
                get: () => {
                    const nodes = [{ key: 'key1' }];
                    return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                        acc[node.key] = node;
                        return acc;
                    }, {});
                },
                initial: { key00: { key: 'key00' } },
            }),
        );

        nodes.get();

        expect(nodes.get()).toEqual({ key1: { key: 'key1' } });
    });
    test('cache with initial', async () => {
        localStorage.setItem('nodesinitial', JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'nodesinitial',
                },
                get: async () => {
                    const nodes = await new Promise<{ key: string }[]>((resolve) =>
                        setTimeout(() => resolve([{ key: 'key1' }]), 10),
                    );
                    return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                        acc[node.key] = node;
                        return acc;
                    }, {});
                },
                initial: { key00: { key: 'key00' } },
            }),
        );

        const state = syncState(nodes);

        expect(state.isLoadedLocal.get()).toEqual(true);
        expect(state.isLoaded.get()).toEqual(false);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await when(state.isLoaded);
        expect(nodes.get()).toEqual({ key1: { key: 'key1' } });
    });
    test('cache makes get receive params', async () => {
        localStorage.setItem('cachedprops', JSON.stringify('cached'));
        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'cachedprops',
                },
                get: async ({ value }) => {
                    return value + '1';
                },
            }),
        );

        const state = syncState(nodes);

        expect(state.isLoadedLocal.get()).toEqual(true);
        expect(state.isLoaded.get()).toEqual(false);
        expect(nodes.get()).toEqual('cached');

        await when(state.isLoaded);
        expect(nodes.get()).toEqual('cached1');
    });
    test('cache async', async () => {
        localStorage.setItem('nodes', JSON.stringify({ key0: { key: 'key0' } }));
        localStorage.setItem('nodes__m', JSON.stringify({ lastSync: 1000 }));

        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'nodes',
                },
                get: async ({ lastSync, value }) => {
                    expect(lastSync).toEqual(1000);
                    expect(value).toEqual({ key0: { key: 'key0' } });
                    const nodes = await new Promise<{ key: string }[]>((resolve) =>
                        setTimeout(() => resolve([{ key: 'key1' }]), 2),
                    );
                    return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                        acc[node.key] = node;
                        return acc;
                    }, {});
                },
            }),
        );

        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
        await promiseTimeout(5);
        expect(nodes.get()).toEqual({ key1: { key: 'key1' } });
        await promiseTimeout(50);
    });
    test('onSet not called until loaded first', async () => {
        localStorage.setItem('onSetNot', JSON.stringify('key0'));

        let getCalled = false;
        let onSetCalled = false;

        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'onSetNot',
                },
                get: async () => {
                    await promiseTimeout(2);
                    expect(onSetCalled).toEqual(false);
                    getCalled = true;
                    return 'key1';
                },
                onSet() {
                    expect(getCalled).toEqual(true);
                    onSetCalled = true;
                },
            }),
        );

        expect(nodes.get()).toEqual('key0');

        nodes.set('key2');

        await promiseTimeout(2);
        expect(nodes.get()).toEqual('key2');
    });
    test('onSet not called until loaded first (2)', async () => {
        localStorage.setItem('onSetNot2', JSON.stringify('key0'));

        let getCalled = false;
        let onSetCalledTimes = 0;

        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'onSetNot2',
                },
                get: async () => {
                    await promiseTimeout(2);
                    expect(onSetCalledTimes).toEqual(0);
                    getCalled = true;
                    return 'key1';
                },
                onSet({ value }) {
                    expect(value).toEqual('key2');
                    expect(getCalled).toEqual(true);
                    onSetCalledTimes++;
                },
            }),
        );

        nodes.set('key2');

        await promiseTimeout(2);
        expect(nodes.get()).toEqual('key2');
        expect(getCalled).toEqual(true);
        expect(onSetCalledTimes).toEqual(1);
    });
});

describe('lastSync with new computed', () => {
    test('lastSync from updateLastSync', async () => {
        const nodes = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'nodes-lastSync',
                },
                get: async ({ updateLastSync }) => {
                    const nodes = await new Promise<{ key: string }[]>((resolve) =>
                        setTimeout(() => resolve([{ key: 'key0' }]), 0),
                    );
                    updateLastSync(1000);
                    return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                        acc[node.key] = node;
                        return acc;
                    }, {});
                },
            }),
        );

        expect(nodes.get()).toEqual(undefined);

        const state = syncState(nodes);

        await when(state.isLoadedLocal);
        await when(state.isLoaded);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await promiseTimeout(1);
        expect(localStorage.getItem('nodes-lastSync')).toEqual(JSON.stringify({ key0: { key: 'key0' } }));
        expect(localStorage.getItem('nodes-lastSync__m')).toEqual(JSON.stringify({ lastSync: 1000 }));
    });
    test('lastSync from subscribe', async () => {
        const value = observable(
            activated({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'lastSync2',
                },
                subscribe: ({ update }) => {
                    setTimeout(() => {
                        update({ value: 'test2', lastSync: 1000 });
                    }, 5);
                },
                get: () => new Promise<string>((resolve) => setTimeout(() => resolve('test'), 1)),
            }),
        );

        expect(value.get()).toEqual(undefined);
        await promiseTimeout(0);
        expect(value.get()).toEqual('test');

        await promiseTimeout(10);
        expect(value.get()).toEqual('test2');
        expect(localStorage.getItem('lastSync2__m')).toEqual(JSON.stringify({ lastSync: 1000 }));
    });
});

describe('retry', () => {
    test('retry a get', async () => {
        const attemptNum$ = observable(0);
        const obs$ = observable(
            activated({
                retry: {
                    delay: 1,
                },
                get: () =>
                    new Promise((resolve, reject) => {
                        attemptNum$.set((v) => v + 1);
                        attemptNum$.peek() > 2 ? resolve('hi') : reject();
                    }),
            }),
        );

        obs$.get();
        expect(attemptNum$.get()).toEqual(1);
        expect(obs$.get()).toEqual(undefined);
        await when(() => attemptNum$.get() === 2);
        expect(obs$.get()).toEqual(undefined);
        await when(() => attemptNum$.get() === 3);
        await promiseTimeout(0);
        expect(obs$.get()).toEqual('hi');
    });
    test('retry a get through persist', async () => {
        const attemptNum$ = observable(0);
        const obs$ = observable(
            activated({
                cache: {
                    local: 'retrypersist',
                    pluginLocal: ObservablePersistLocalStorage,
                },
                retry: {
                    delay: 1,
                },
                get: () =>
                    new Promise((resolve, reject) => {
                        attemptNum$.set((v) => v + 1);
                        attemptNum$.peek() > 2 ? resolve('hi') : reject();
                    }),
            }),
        );

        obs$.get();
        expect(attemptNum$.get()).toEqual(1);
        expect(obs$.get()).toEqual(undefined);
        await when(() => attemptNum$.get() === 2);
        expect(obs$.get()).toEqual(undefined);
        await when(() => attemptNum$.get() === 3);
        await promiseTimeout(0);
        expect(obs$.get()).toEqual('hi');
    });
    test('retry a set', async () => {
        const attemptNum$ = observable(0);
        let saved = undefined;
        const obs$ = observable(
            activated({
                retry: {
                    delay: 1,
                },
                onSet: ({ value }, { onError }) => {
                    return new Promise<void>((resolve) => {
                        attemptNum$.set((v) => v + 1);
                        if (attemptNum$.get() > 2) {
                            saved = value;
                            resolve();
                        } else {
                            onError();
                        }
                    });
                },
            }),
        );

        obs$.get();

        expect(attemptNum$.get()).toEqual(0);
        obs$.set(1);
        await when(() => attemptNum$.get() === 1);
        expect(attemptNum$.get()).toEqual(1);
        expect(saved).toEqual(undefined);
        await when(() => attemptNum$.get() === 2);
        expect(saved).toEqual(undefined);
        await when(() => attemptNum$.get() === 3);
        expect(saved).toEqual(1);
    });
});
