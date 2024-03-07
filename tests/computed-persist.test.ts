import { persistObservable, synced } from '../persist';
import { event } from '../src/event';
import { observable, syncState } from '../src/observable';
import { ObservablePersistLocalStorage } from '../src/persist-plugins/local-storage';
import { when, whenReady } from '../src/when';
import { mockLocalStorage, promiseTimeout } from './testglobals';

const testNode = observable({});
persistObservable(testNode, {
    pluginRemote: {
        get() {
            return Promise.resolve({ test: 'hi' });
        },
    },
});

mockLocalStorage();

describe('caching with new computed', () => {
    test('cache basic', async () => {
        localStorage.setItem('nodesbasic', JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            synced({
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
            synced({
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
            synced({
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
    test('cache with ownKeys', async () => {
        localStorage.setItem('nodesinitialownkeys', JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            synced({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'nodesinitialownkeys',
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
        expect(Object.keys(nodes)).toEqual(['key0']);
    });
    test('cache makes get receive params', async () => {
        localStorage.setItem('cachedprops', JSON.stringify('cached'));
        const nodes = observable(
            synced({
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
            synced({
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
            synced({
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
            synced({
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
    test('get not called until all ancestors loaded', async () => {
        localStorage.setItem('getnotcalled', JSON.stringify({ child: 'key0' }));

        let getCalled = false;
        const ev = event();

        const nodes = observable({
            child: synced({
                get: async () => {
                    await when(ev);
                    getCalled = true;
                    return 'key1';
                },
            }),
        });

        persistObservable(nodes, { pluginLocal: ObservablePersistLocalStorage, local: 'getnotcalled' });

        expect(nodes.child.get()).toEqual('key0');
        expect(nodes.get()).toEqual({ child: 'key0' });

        ev.fire();
        expect(nodes.child.get()).toEqual('key0');
        expect(nodes.get()).toEqual({ child: 'key0' });
        await promiseTimeout(0);
        expect(nodes.child.get()).toEqual('key1');
        expect(nodes.get()).toEqual({ child: 'key1' });
        expect(getCalled).toEqual(true);
    });
});

describe('lastSync with new computed', () => {
    test('lastSync from updateLastSync', async () => {
        const nodes = observable(
            synced({
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
            synced({
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
            synced({
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
            synced({
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
    test('retry a set with a promise', async () => {
        const attemptNum$ = observable(0);
        let saved = undefined;
        const obs$ = observable(
            synced({
                retry: {
                    delay: 1,
                },
                onSet: ({ value }) => {
                    return new Promise<void>((resolve) => {
                        attemptNum$.set((v) => v + 1);
                        if (attemptNum$.get() > 2) {
                            saved = value;
                            resolve();
                        } else {
                            throw new Error();
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
describe('subscribing to computeds', () => {
    test('subscription with update', async () => {
        const obs = observable(
            synced({
                subscribe: ({ update }) => {
                    setTimeout(() => {
                        update({ value: 'hi there again' });
                    }, 5);
                },
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => resolve('hi there'), 0);
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);
        await promiseTimeout(0);
        expect(obs.get()).toEqual('hi there');
        await promiseTimeout(10);
        expect(obs.get()).toEqual('hi there again');
    });
    test('subscription with refresh', async () => {
        let num = 0;
        const waiter$ = observable(0);
        const obs = observable(
            synced({
                subscribe: ({ refresh }) => {
                    when(
                        () => waiter$.get() === 1,
                        () => {
                            setTimeout(() => {
                                refresh();
                            }, 0);
                        },
                    );
                },
                get: () =>
                    new Promise<string>((resolve) => {
                        setTimeout(() => {
                            resolve('hi there ' + num++);
                            waiter$.set((v) => v + 1);
                        }, 0);
                    }),
            }),
        );
        expect(obs.get()).toEqual(undefined);
        await promiseTimeout(0);
        expect(obs.get()).toEqual('hi there 0');
        await when(() => waiter$.get() === 2);
        expect(obs.get()).toEqual('hi there 1');
    });
    test('subscribe update runs after get', async () => {
        let didGet = false;
        const didSubscribe$ = observable(false);
        const obs = observable(
            synced({
                subscribe: ({ update }) => {
                    setTimeout(() => {
                        update({ value: 'from subscribe' });
                        didSubscribe$.set(true);
                    }, 0);
                },
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            didGet = true;
                            resolve('hi there');
                        }, 5);
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);
        expect(didGet).toEqual(false);
        await promiseTimeout(0);
        expect(didGet).toEqual(false);
        expect(obs.get()).toEqual(undefined);
        await promiseTimeout(0);
        expect(didGet).toEqual(false);
        expect(obs.get()).toEqual(undefined);
        await whenReady(obs);
        expect(didGet).toEqual(true);
        expect(obs.get()).toEqual('hi there');
        await when(didSubscribe$);
        expect(obs.get()).toEqual('from subscribe');
    });
    test('activated with get running multiple times', async () => {
        const gets$ = observable(0);
        const refresh$ = observable(1);
        const obs$ = observable(
            synced({
                get: () => {
                    refresh$.get();
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            resolve('hi ' + refresh$.peek());
                            gets$.set((v) => v + 1);
                        }, 5);
                    });
                },
            }),
        );
        expect(obs$.get()).toEqual(undefined);
        expect(gets$.get()).toEqual(0);
        await whenReady(obs$);
        expect(gets$.get()).toEqual(1);
        expect(obs$.get()).toEqual('hi 1');

        refresh$.set((v) => v + 1);

        await when(() => gets$.get() === 2);
        await promiseTimeout(0);

        expect(obs$.get()).toEqual('hi 2');
    });
});
