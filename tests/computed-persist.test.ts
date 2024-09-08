import { event, observable, observe, syncState, when, whenReady } from '@legendapp/state';
import { configureSynced, syncObservable, synced } from '@legendapp/state/sync';
import { onChangeRemote } from '../src/sync/syncObservable';
import { ObservablePersistLocalStorage, getPersistName, localStorage, promiseTimeout } from './testglobals';

jest?.setTimeout?.(1000);

describe('caching with new computed', () => {
    test('persist basic', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
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

        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
        const state = syncState(nodes);

        expect(state.isPersistLoaded.get()).toEqual(true);
        expect(state.isLoaded.get()).toEqual(false);

        await when(state.isLoaded);
        expect(nodes.get()).toEqual({ key1: { key: 'key1' } });
    });
    test('persist with no delay', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
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
    test('synced with only initial', () => {
        const nodes = observable(
            synced({
                initial: { key00: { key: 'key00' } },
            }),
        );

        expect(nodes.get()).toEqual({ key00: { key: 'key00' } });
    });
    test('synced with initial array', () => {
        const nodes = observable(
            synced({
                initial: [],
            }),
        );

        expect(nodes.get()).toEqual([]);
    });
    test('configured synced with initial array', () => {
        const mySynced = configureSynced({ persist: { plugin: ObservablePersistLocalStorage } });
        const nodes = observable(
            mySynced({
                initial: [],
            }),
        );

        expect(nodes.get()).toEqual([]);
    });
    test('persist with get and initial', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ key0: 'key0' }));
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                get: async () => {
                    const nodes = await new Promise<Record<string, string>>((resolve) =>
                        setTimeout(() => resolve({ key2: 'key2', key3: 'key3' }), 10),
                    );
                    return nodes;
                },
                initial: { key1: 'key1' },
            }),
        );

        expect(nodes.get()).toEqual({ key0: 'key0', key1: 'key1' });
        const state = syncState(nodes);

        expect(state.isPersistLoaded.get()).toEqual(true);
        expect(state.isLoaded.get()).toEqual(false);

        await when(state.isLoaded);

        await when(nodes['key2']);
        expect(nodes.get()).toEqual({ key2: 'key2', key3: 'key3' });
    });
    test('persist with initial and no get', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ key0: 'key0' }));
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                initial: { key1: 'key1' },
            }),
        );

        expect(nodes.get()).toEqual({ key0: 'key0', key1: 'key1' });
        const state = syncState(nodes);

        expect(state.isPersistLoaded.get()).toEqual(true);
        expect(state.isLoaded.get()).toEqual(true);
    });
    test('persist with initial and no get and set', async () => {
        const persistName = getPersistName();
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                initial: { key00: { key: 'key00', value: 'hi' } },
            }),
        );

        expect(nodes.get()).toEqual({ key00: { key: 'key00', value: 'hi' } });

        nodes.key00.value.set('hello');

        await promiseTimeout(0);

        // Without the same initial it only has the diff
        const nodes2 = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
            }),
        );

        expect(nodes2.get()).toEqual({ key00: { key: 'key00', value: 'hello' } });

        // Matches if it has the same initial
        const nodes3 = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                initial: { key00: { key: 'key00', value: 'hi' } },
            }),
        );

        expect(nodes3.get()).toEqual({ key00: { key: 'key00', value: 'hello' } });
    });
    test('persist with ownKeys', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
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
    test('persist makes get receive params', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify('persistd'));
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                get: async ({ value }) => {
                    return value + '1';
                },
            }),
        );

        expect(nodes.get()).toEqual('persistd');
        const state = syncState(nodes);

        expect(state.isPersistLoaded.get()).toEqual(true);
        expect(state.isLoaded.get()).toEqual(false);

        await when(state.isLoaded);
        expect(nodes.get()).toEqual('persistd1');
    });
    test('persist async', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ key0: { key: 'key0' } }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));

        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
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
    test('set not called until loaded first', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify('key0'));

        let getCalled = false;
        let setCalled = false;

        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                get: async () => {
                    await promiseTimeout(2);
                    expect(setCalled).toEqual(false);
                    getCalled = true;
                    return 'key1';
                },
                set() {
                    expect(getCalled).toEqual(true);
                    setCalled = true;
                },
            }),
        );

        expect(nodes.get()).toEqual('key0');

        nodes.set('key2');

        await promiseTimeout(2);
        expect(nodes.get()).toEqual('key2');
    });
    test('set not called until loaded first (2)', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify('key0'));

        let getCalled = false;
        let setCalledTimes = 0;

        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                },
                get: async () => {
                    await promiseTimeout(2);
                    expect(setCalledTimes).toEqual(0);
                    getCalled = true;
                    return 'key1';
                },
                set({ value }) {
                    expect(value).toEqual('key2');
                    expect(getCalled).toEqual(true);
                    setCalledTimes++;
                },
            }),
        );

        nodes.set('key2');

        await promiseTimeout(2);
        expect(nodes.get()).toEqual('key2');
        expect(getCalled).toEqual(true);
        expect(setCalledTimes).toEqual(1);
    });
    test('get not called until all ancestors loaded', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ child: 'key0' }));

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

        syncObservable(nodes, { persist: { plugin: ObservablePersistLocalStorage, name: persistName } });
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
    test('get not called on child immediately', async () => {
        let getCalled = false;

        const nodes = observable({
            me: synced({
                get: () => {
                    return 'key1';
                },
            }),
            child: synced({
                get: () => {
                    getCalled = true;
                    return 'key2';
                },
            }),
        });

        expect(getCalled).toEqual(false);
        nodes.me.get();
        expect(getCalled).toEqual(false);
    });
});

describe('lastSync with new computed', () => {
    test('lastSync from updateLastSync', async () => {
        const nodes = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: 'nodes-lastSync',
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

        await when(state.isPersistLoaded);
        await when(state.isLoaded);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await promiseTimeout(1);
        expect(localStorage.getItem('nodes-lastSync')).toEqual(JSON.stringify({ key0: { key: 'key0' } }));
        expect(localStorage.getItem('nodes-lastSync__m')).toEqual(JSON.stringify({ lastSync: 1000 }));
    });
    test('lastSync from subscribe', async () => {
        const value = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: 'lastSync2',
                },
                subscribe: ({ update }) => {
                    setTimeout(() => {
                        update({ value: 'test2', lastSync: 1000 });
                    }, 10);
                },
                get: () => new Promise<string>((resolve) => setTimeout(() => resolve('test'), 1)),
            }),
        );

        expect(value.get()).toEqual(undefined);
        await promiseTimeout(0);
        expect(value.get()).toEqual('test');

        await promiseTimeout(10);
        expect(value.get()).toEqual('test2');
        await promiseTimeout(10);
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
                persist: {
                    name: 'retrypersist',
                    plugin: ObservablePersistLocalStorage,
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
                set: ({ value }) => {
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
        await when(() => obs.get() === 'hi there 1');
        expect(obs.get()).toEqual('hi there 1');
    });
    test('subscribe update runs right after get', async () => {
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
                        }, 10);
                    });
                },
            }),
        );
        expect(didGet).toEqual(false);
        expect(didSubscribe$.get()).toEqual(false);
        expect(obs.get()).toEqual(undefined);
        await whenReady(obs);
        expect(didGet).toEqual(true);
        expect(didSubscribe$.get()).toEqual(true);
        expect(obs.get()).toEqual('from subscribe');
    });
    test('subscribe refresh runs after get', async () => {
        let numGets = 0;
        const didSubscribe$ = observable(false);
        let refreshNum = 0;
        const obs = observable(
            synced({
                subscribe: ({ refresh }) => {
                    setTimeout(() => {
                        refresh();
                        didSubscribe$.set(true);
                    }, 0);
                },
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            numGets++;
                            resolve(refreshNum++ > 0 ? 'after subscribed' : 'before');
                        }, 10);
                    });
                },
            }),
        );
        expect(numGets).toEqual(0);
        expect(didSubscribe$.get()).toEqual(false);
        expect(obs.get()).toEqual(undefined);
        await whenReady(obs);
        expect(numGets).toEqual(1);
        expect(didSubscribe$.get()).toEqual(true);
        expect(obs.get()).toEqual('before');
        await when(() => obs.get() === 'after subscribed');
        expect(numGets).toEqual(2);
        expect(obs.get()).toEqual('after subscribed');
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
        await when(() => obs$.get() === 'hi 2');
        expect(obs$.get()).toEqual('hi 2');
    });
    test('synced does not set undefined from initial', async () => {
        let didSet = false;
        const obs = observable(
            synced({
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: 'synced does not set undefined from initial',
                },
                get: async () => {
                    return new Promise<string>((resolve) => setTimeout(() => resolve('hi'), 10));
                },
                set: () => {
                    didSet = true;
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);
        expect(didSet).toEqual(false);
        await when(obs);
        expect(obs.get()).toEqual('hi');
    });
});
describe('Remote changes', () => {
    test('Remote changes dont trigger set', async () => {
        let sets = 0;
        let setTo: string | undefined = undefined;
        const obs = observable(
            synced({
                get: () => {
                    return 'hi';
                },
                set: ({ value }) => {
                    sets++;
                    setTo = value;
                },
            }),
        );
        expect(sets).toEqual(0);
        obs.set('hello');
        await promiseTimeout(0);
        expect(sets).toEqual(1);
        expect(setTo).toEqual('hello');
        onChangeRemote(() => {
            obs.set('hello!');
            expect(sets).toEqual(1);
        });
        onChangeRemote(() => {
            obs.set('hello!!!!');
            expect(sets).toEqual(1);
        });
        obs.set('hiz');
        await promiseTimeout(0);
        expect(sets).toEqual(2);
        expect(setTo).toEqual('hiz');
    });
    test('Sets from observe during remote change are not remote', async () => {
        const obs$ = observable('hi');
        const target$ = observable('');

        observe(() => {
            target$.set(obs$.get());
        });

        target$.onChange(({ isFromSync, value }) => {
            expect(isFromSync).toEqual(false);
            expect(value).toEqual(obs$.get());
        });

        onChangeRemote(() => {
            obs$.set('hello!');
        });
        expect(obs$.get()).toEqual('hello!');
        expect(target$.get()).toEqual('hello!');
    });
});
describe('Debouncing', () => {
    test('Remote changes do not debounce by default', async () => {
        let startTime = 0;
        const didSet$ = observable<string>();
        const obs = observable(
            synced({
                get: () => {
                    return 'hi';
                },
                set: ({ value }) => {
                    didSet$.set(value);
                },
            }),
        );

        startTime = performance.now();
        obs.set('hello');
        const res = await when(didSet$);
        expect(res).toEqual('hello');
        expect(performance.now() - startTime).toBeLessThan(5);
    });
    test('Remote changes debounce', async () => {
        let startTime = 0;
        const didSet$ = observable<string>();
        const obs = observable(
            synced({
                get: () => {
                    return 'hi';
                },
                set: ({ value }) => {
                    didSet$.set(value);
                },
                debounceSet: 20,
            }),
        );

        startTime = performance.now();
        obs.set('hello');
        const res = await when(didSet$);
        expect(res).toEqual('hello');
        expect(performance.now() - startTime).toBeGreaterThan(18);
    });
    test('Remote changes debounce with global config', async () => {
        let startTime = 0;
        const didSet$ = observable<string>();
        const mySynced = configureSynced(synced, { debounceSet: 20, persist: { plugin: undefined } });
        const obs = observable(
            mySynced({
                get: () => {
                    return 'hi';
                },
                set: ({ value }) => {
                    didSet$.set(value);
                },
            }),
        );

        startTime = performance.now();
        obs.set('hello');
        const res = await when(didSet$);
        expect(res).toEqual('hello');
        expect(performance.now() - startTime).toBeGreaterThan(18);
    });
    test('Remote changes debounce with global config and custom', async () => {
        let startTime = 0;
        const didSet1$ = observable<string>();
        const didSet2$ = observable<string>();
        const mySynced = configureSynced(synced, { debounceSet: 10 });
        const obs = observable(
            mySynced({
                get: () => {
                    return 'hi';
                },
                set: ({ value }) => {
                    didSet1$.set(value);
                },
            }),
        );
        const obs2 = observable(
            mySynced({
                get: () => {
                    return 'hi';
                },
                set: ({ value }) => {
                    didSet2$.set(value);
                },
                debounceSet: 20,
            }),
        );

        startTime = performance.now();
        obs.set('hello');
        obs2.set('hello');
        await when(didSet1$);
        const diff1 = performance.now() - startTime;
        expect(diff1).toBeGreaterThan(8);
        expect(diff1).toBeLessThan(18);
        await when(didSet2$);
        const diff2 = performance.now() - startTime;
        expect(diff2).toBeGreaterThan(18);
        expect(diff2).toBeLessThan(28);
    });
});

describe('initial function', () => {
    test('initial function', () => {
        const obs = observable(
            synced({
                initial: () => ({ id: 'hi', test: 'hi' }),
            }),
        );

        expect(obs.get()).toEqual({ id: 'hi', test: 'hi' });
    });
    test('initial function with immediate get', async () => {
        const obs = observable(
            synced({
                initial: () => ({ id: 'hi', test: 'hi' }),
                get: () => ({ id: 'hi', test: 'hi2' }),
            }),
        );

        expect(obs.get()).toEqual({ id: 'hi', test: 'hi2' });
    });
    test('initial function with delayed get', async () => {
        const obs = observable(
            synced({
                initial: () => ({ id: 'hi', test: 'hi' }),
                get: async () => {
                    await promiseTimeout(0);
                    return { id: 'hi', test: 'hi2' };
                },
            }),
        );

        expect(obs.get()).toEqual({ id: 'hi', test: 'hi' });

        await promiseTimeout();
        expect(obs.get()).toEqual({ id: 'hi', test: 'hi2' });
    });
});
