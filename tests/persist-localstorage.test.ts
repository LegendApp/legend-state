import { isArray, isObject, isString } from '../src/is';
import { observable } from '../src/observable';
import { ObservablePersistLocalStorageBase } from '../src/cache-plugins/local-storage';
import { configureObservablePersistence } from '../src/persist/configureObservablePersistence';
import { persistObservable } from '../src/persist/persistObservable';
import { mockLocalStorage } from './testglobals';

const localStorage = mockLocalStorage();
class ObservablePersistLocalStorage extends ObservablePersistLocalStorageBase {
    constructor() {
        super(localStorage);
    }
}

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
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

configureObservablePersistence({
    pluginLocal: ObservablePersistLocalStorage,
});

let localNum = 0;
const getLocalName = () => 'jestlocal' + localNum++;

describe('Persist local localStorage', () => {
    test('Saves to local', async () => {
        const obs = observable({ test: '' });
        const local = getLocalName();

        persistObservable(obs, {
            local,
        });

        obs.set({ test: 'hello' });

        await promiseTimeout(0);

        const localValue = localStorage.getItem(local);

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        persistObservable(obs2, {
            local,
        });

        expect(obs2.get()).toEqual({ test: 'hello' });
    });
    test('Saves empty root object to local overwriting complex', async () => {
        const local = getLocalName();
        const obs = observable({ test: { text: 'hi' } } as { test: Record<string, any> });

        persistObservable(obs, {
            local,
        });

        obs.test.set({});

        await promiseTimeout(0);

        const localValue = localStorage.getItem(local);

        // Should have saved to local storage
        expect(localValue).toBe('{"test":{}}');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        persistObservable(obs2, {
            local,
        });

        expect(obs2.get()).toEqual({ test: {} });
    });
    test('Merges cached value with initial', async () => {
        const obs = observable({ test: { text: 'hi' } } as { test: Record<string, any> });
        const local = getLocalName();
        localStorage.setItem(local, '{"test2":{"text":"hello"}}');

        persistObservable(obs, {
            local,
        });

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
        const local = getLocalName();
        const obs = observable({ test: 'hello' } as Record<string, any>);

        persistObservable(obs, {
            local,
        });

        obs.set({});

        await promiseTimeout(0);

        const localValue = localStorage.getItem(local);

        // Should have saved to local storage
        expect(localValue).toBe('{}');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable({});
        persistObservable(obs2, {
            local,
        });

        expect(obs2).toEqual({});
    });
    // TODO: Put this back when adding remote persistence
    // test('Loads from local with modified', () => {
    //     localStorage.setItem(
    //         local,
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
    //         local,
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
        const local = getLocalName();
        const obs = observable('');

        persistObservable(obs, {
            local,
        });

        obs.set('hello');

        await promiseTimeout(0);

        const localValue = localStorage.getItem(local);

        // Should have saved to local storage
        expect(localValue).toBe('"hello"');

        // obs2 should load with the same value it was just saved as
        const obs2 = observable('');
        persistObservable(obs2, {
            local,
        });

        expect(obs2.get()).toEqual('hello');
    });
});

describe('Persist computed', () => {
    test('Persist nested computed', async () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: () => sub$.num.get(),
        });

        persistObservable(obs$, {
            local: 'Persist computed',
        });

        obs$.sub.get();
        sub$.num.set(1);

        await promiseTimeout(0);

        const localValue = localStorage.getItem('Persist computed')!;

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

        expect(obs2$.sub.get()).toEqual(2);

        persistObservable(obs2$, {
            local: 'Persist computed',
        });

        expect(obs2$.sub.get()).toEqual(2);

        expect(obs2$.get()).toEqual({ sub: 2 });

        // Ensure computed is still hooked up
        sub2$.num.set(3);
        expect(obs2$.get()).toEqual({ sub: 3 });
    });
    test('Persist nested computed (2)', async () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: () => sub$.num.get(),
        });

        persistObservable(obs$, {
            local: 'Persist computed',
        });

        obs$.sub.get();
        sub$.num.set(1);

        await promiseTimeout(0);

        const localValue = localStorage.getItem('Persist computed')!;

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

        persistObservable(obs2$, {
            local: 'Persist computed',
        });

        expect(obs2$.sub.get()).toEqual(2);

        expect(obs2$.get()).toEqual({ sub: 2 });

        // Ensure computed is still hooked up
        sub2$.num.set(3);
        expect(obs2$.get()).toEqual({ sub: 3 });
    });
});
