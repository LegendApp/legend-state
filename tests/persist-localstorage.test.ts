import { syncObservable } from '../src/sync/syncObservable';
import { isArray, isObject, isString } from '../src/is';
import { observable } from '../src/observable';
import { configureSynced } from '../src/sync/configureSynced';
import { ObservablePersistLocalStorage, getPersistName, localStorage, promiseTimeout } from './testglobals';
import { synced } from '../src/sync/synced';

export async function recursiveReplaceStrings<T extends string | object | number | boolean>(
    value: T,
    replacer: (val: string) => string,
): Promise<T> {
    if (isArray(value)) {
        await Promise.all(
            value.map((v, i) =>
                recursiveReplaceStrings(v, replacer).then((val) => {
                    (value as any[])[i] = val;
                }),
            ),
        );
    }
    if (isObject(value)) {
        await Promise.all(
            Object.keys(value).map((k) =>
                recursiveReplaceStrings((value as Record<string, any>)[k], replacer).then((val) => {
                    (value as Record<string, any>)[k] = val;
                }),
            ),
        );
    }
    if (isString(value)) {
        value = await new Promise((resolve) => resolve(replacer(value as string) as T));
    }

    return value;
}

const mySynced = configureSynced(synced, {
    persist: {
        plugin: ObservablePersistLocalStorage,
    },
});

describe('Persist local localStorage', () => {
    test('Saves to local', async () => {
        const persistName = getPersistName();
        const obs = observable({ test: '' });

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs.set({ test: 'hello' });

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        syncObservable(
            obs2,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2.get()).toEqual({ test: 'hello' });
    });
    test('Saves primitive to local', async () => {
        const persistName = getPersistName();
        const obs = observable('');

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs.set('hello');

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe('"hello"');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable();
        syncObservable(
            obs2,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2.get()).toEqual('hello');
    });
    test('Saves empty root object to local overwriting complex', async () => {
        const persistName = getPersistName();
        const obs = observable({ test: { text: 'hi' } } as { test: Record<string, any> });

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs.test.set({});

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe('{"test":{}}');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        syncObservable(
            obs2,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2.get()).toEqual({ test: {} });
    });
    test('Merges persisted value with initial', async () => {
        const obs = observable({ test: { text: 'hi' } } as { test: Record<string, any> });
        const persistName = getPersistName();
        localStorage.setItem(persistName, '{"test2":{"text":"hello"}}');

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs.get()).toEqual({
            test: {
                text: 'hi',
            },
            test2: {
                text: 'hello',
            },
        });
    });
    test('Saves empty root object to local', async () => {
        const persistName = getPersistName();
        const obs = observable({ test: 'hello' } as Record<string, any>);

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs.set({});

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe('{}');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        syncObservable(
            obs2,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2.get()).toEqual({});
    });
    test('Init with empty and add data', async () => {
        const persistName = getPersistName();
        const obs = observable();

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs.set({ key: 'value' });

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe('{"key":"value"}');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable();
        syncObservable(
            obs2,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2.get()).toEqual({ key: 'value' });
    });
    test('Deletes from local', async () => {
        const persistName = getPersistName();
        const obs = observable({ test: '' });

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs.set({ test: 'hello' });

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        obs.test.delete();

        await promiseTimeout(0);

        const localValue2 = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue2).toBe(`{}`);
    });
});

describe('Persist primitives', () => {
    test('Primitive saves to local', async () => {
        const persistName = getPersistName();
        const obs = observable('');

        syncObservable(
            obs,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs.set('hello');

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe('"hello"');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable('');
        syncObservable(
            obs2,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2.get()).toEqual('hello');
    });
});

describe('Persist computed', () => {
    test('Persist nested computed', async () => {
        const persistName = getPersistName();
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: () => sub$.num.get(),
        });

        syncObservable(
            obs$,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs$.sub.get();
        sub$.num.set(1);

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName)!;

        // Should have saved to local storage
        expect(JSON.parse(localValue)).toEqual({ sub: 1 });

        // obs2 should not load sub and instead use the computed value
        const sub2$ = observable({
            num: 2,
        });
        const obs2$ = observable({
            sub: () => {
                return sub2$.num.get();
            },
        });

        syncObservable(
            obs2$,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2$.sub.get()).toEqual(2);

        expect(obs2$.get()).toEqual({ sub: 2 });

        // Ensure computed is still hooked up
        sub2$.num.set(3);
        expect(obs2$.get()).toEqual({ sub: 3 });
    });
    test('Persist nested computed (2)', async () => {
        const persistName = getPersistName();
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: () => sub$.num.get(),
        });

        syncObservable(
            obs$,
            mySynced({
                persist: { name: persistName },
            }),
        );

        obs$.sub.get();
        sub$.num.set(1);

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName)!;

        // Should have saved to local storage
        expect(JSON.parse(localValue)).toEqual({ sub: 1 });

        // obs2 should not load sub and instead use the computed value
        const sub2$ = observable({
            num: 2,
        });
        const obs2$ = observable({
            sub: () => {
                return sub2$.num.get();
            },
        });

        syncObservable(
            obs2$,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2$.sub.get()).toEqual(2);

        expect(obs2$.get()).toEqual({ sub: 2 });

        // Ensure computed is still hooked up
        sub2$.num.set(3);
        expect(obs2$.get()).toEqual({ sub: 3 });
    });
    test('Persist Map', async () => {
        const persistName = getPersistName();
        const obs$ = observable(new Map<string, string>());

        syncObservable(
            obs$,
            mySynced({
                persist: { name: persistName },
            }),
        );
        obs$.set('key', 'val');

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName)!;

        // Should have saved to local storage
        expect(localValue).toEqual('{"__LSType":"Map","value":[["key","val"]]}');

        const obs2$ = observable(new Map<string, string>());

        syncObservable(
            obs2$,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2$.get()).toEqual(new Map([['key', 'val']]));
    });
    test('Persist Set', async () => {
        const persistName = getPersistName();
        const obs$ = observable(new Set<string>());

        syncObservable(
            obs$,
            mySynced({
                persist: { name: persistName },
            }),
        );
        obs$.add('key');

        await promiseTimeout(0);

        const localValue = localStorage.getItem(persistName)!;

        // Should have saved to local storage
        expect(localValue).toEqual('{"__LSType":"Set","value":["key"]}');

        const obs2$ = observable(new Set<string>());

        syncObservable(
            obs2$,
            mySynced({
                persist: { name: persistName },
            }),
        );

        expect(obs2$.get()).toEqual(new Set(['key']));
    });
});
