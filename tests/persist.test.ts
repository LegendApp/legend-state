import { isArray, isObject, isString } from '../src/is';
import { configureObservablePersistence } from '../src/persist/configureObservablePersistence';
import { symbolDateModified } from '../src/globals';
import { observable } from '../src/observable';
import { mapPersistences, persistObservable } from '../src/persist/persistObservable';
import { ObservablePersistLocalStorage } from '../src/persist/local-storage';

class LocalStorageMock {
    store: Record<any, any>;
    constructor() {
        this.store = {};
    }
    clear() {
        this.store = {};
    }
    getItem(key) {
        return this.store[key] || null;
    }
    setItem(key, value) {
        this.store[key] = String(value);
    }
    removeItem(key) {
        delete this.store[key];
    }
}

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

export async function recursiveReplaceStrings<T extends string | object | number | boolean>(
    value: T,
    replacer: (val: string) => string
): Promise<T> {
    if (isArray(value)) {
        await Promise.all(
            value.map((v, i) =>
                recursiveReplaceStrings(v, replacer).then((val) => {
                    value[i] = val;
                })
            )
        );
    }
    if (isObject(value)) {
        await Promise.all(
            Object.keys(value).map((k) =>
                recursiveReplaceStrings(value[k], replacer).then((val) => {
                    value[k] = val;
                })
            )
        );
    }
    if (isString(value)) {
        value = await new Promise((resolve) => resolve(replacer(value as string) as T));
    }

    return value;
}

// @ts-ignore
global.localStorage = new LocalStorageMock();

configureObservablePersistence({
    persistLocal: ObservablePersistLocalStorage,
    saveTimeout: 16,
});

// jest.setTimeout(10000);

beforeEach(() => {
    global.localStorage.clear();
    const local = mapPersistences.get(ObservablePersistLocalStorage) as ObservablePersistLocalStorage;
    if (local) {
        local['data'] = {};
    }
});

describe('Persist local', () => {
    test('Saves to local', () => {
        const obs = observable({ test: '' });

        persistObservable(obs, {
            local: 'jestlocal',
        });

        obs.set({ test: 'hello' });

        const localValue = global.localStorage.getItem('jestlocal');

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        persistObservable(obs2, {
            local: 'jestlocal',
        });

        expect(obs2).toEqual({ test: 'hello' });
    });
    // TODO: Put this back when adding remote persistence
    // test('Loads from local with modified', () => {
    //     global.localStorage.setItem(
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
