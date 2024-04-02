import { isArray, isObject, isString } from '../src/is';
import { observable } from '../src/observable';
import { ObservablePersistLocal } from '../src/persistTypes';
import { ObservablePersistSessionStorage } from '../src/persist-plugins/local-storage';
import { configureObservablePersistence } from '../src/persist/configureObservablePersistence';
import { mapPersistences, persistObservable } from '../src/persist/persistObservable';

class LocalStorageMock {
    store: Record<any, any>;
    constructor() {
        this.store = {};
    }
    clear() {
        this.store = {};
    }
    getItem(key: string) {
        return this.store[key] || null;
    }
    setItem(key: string, value: any) {
        this.store[key] = String(value);
    }
    removeItem(key: string) {
        delete this.store[key];
    }
}

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

function reset() {
    global.sessionStorage.clear();
    const persist = mapPersistences.get(ObservablePersistSessionStorage)?.persist as ObservablePersistLocal;
    if (persist) {
        persist.deleteTable('jestlocal', undefined as any);
    }
}

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

// @ts-expect-error This is ok to do in jest
global.sessionStorage = new LocalStorageMock();

configureObservablePersistence({
    pluginLocal: ObservablePersistSessionStorage,
});

beforeEach(() => {
    reset();
});

describe('Persist local', () => {
    test('Saves to local', async () => {
        const obs = observable({ test: '' });

        persistObservable(obs, {
            local: 'jestlocal',
        });

        obs.set({ test: 'hello' });

        await promiseTimeout(0);

        const localValue = global.sessionStorage.getItem('jestlocal');

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        persistObservable(obs2, {
            local: 'jestlocal',
        });

        expect(obs2.get()).toEqual({ test: 'hello' });
    });
    test('Saves empty root object to local overwriting complex', async () => {
        reset();
        const obs = observable({ test: { text: 'hi' } } as { test: Record<string, any> });

        persistObservable(obs, {
            local: 'jestlocal',
        });

        obs.test.set({});

        await promiseTimeout(0);

        const localValue = global.sessionStorage.getItem('jestlocal');

        // Should have saved to local storage
        expect(localValue).toBe('{"test":{}}');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        persistObservable(obs2, {
            local: 'jestlocal',
        });

        expect(obs2.get()).toEqual({ test: {} });
    });
    test('Saves empty root object to local', async () => {
        reset();
        const obs = observable({ test: 'hello' } as Record<string, any>);

        persistObservable(obs, {
            local: 'jestlocal',
        });

        obs.set({});

        await promiseTimeout(0);

        const localValue = global.sessionStorage.getItem('jestlocal');

        // Should have saved to local storage
        expect(localValue).toBe('{}');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        persistObservable(obs2, {
            local: 'jestlocal',
        });

        expect(obs2).toEqual({});
    });
    // TODO: Put this back when adding remote persistence
    // test('Loads from local with modified', () => {
    //     global.sessionStorage.setItem(
    //         'jestlocal',
    //         JSON.stringify({
    //             test: { '@': 1000, test2: 'hi2', test3: 'hi3' },
    //             test4: { test5: { '@': 1001, test6: 'hi6' } },
    //             test7: { test8: 'hi8' },
    //         })
    //     );

    //     const obs = observable({
    //         test: { test2: '', test3: '' },
    //         test4: { test5: { test6: '' } },
    //         test7: { test8: '' },
    //     });

    //     persistObservable(obs, {
    //         local: 'jestlocal',
    //         // persistRemote: //
    //         remote: {},
    //     });

    //     expect(obs.get()).toEqual({
    //         test: { [symbolDateModified]: 1000, test2: 'hi2', test3: 'hi3' },
    //         test4: { test5: { [symbolDateModified]: 1001, test6: 'hi6' } },
    //         test7: { test8: 'hi8' },
    //     });
    // });
});

describe('Persist primitives', () => {
    test('Primitive saves to local', async () => {
        const obs = observable('');

        persistObservable(obs, {
            local: 'jestlocal',
        });

        obs.set('hello');

        await promiseTimeout(0);

        const localValue = global.sessionStorage.getItem('jestlocal');

        // Should have saved to local storage
        expect(localValue).toBe('"hello"');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable('');
        persistObservable(obs2, {
            local: 'jestlocal',
        });

        expect(obs2.get()).toEqual('hello');
    });
});
