import { observable } from '../src/observable';
import { observablePersistAsyncStorage } from '../src/persist-plugins/async-storage';
import { syncObservable } from '../src/sync/syncObservable';
import { synced } from '../src/sync/synced';
import { ObservablePersistLocalStorage, getPersistName, promiseTimeout } from './testglobals';

function createAsyncStorage(entries: [string, string][] = []) {
    const store = new Map<string, string>(entries);
    return {
        store,
        AsyncStorage: {
            getAllKeys: async () => Array.from(store.keys()),
            multiGet: async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null]),
            setItem: async (key: string, value: string) => void store.set(key, value),
            removeItem: async (key: string) => void store.delete(key),
        } as any,
    };
}

describe('AsyncStorage empty tables (#416)', () => {
    test.each([true, false])('getTable returns init for a missing table (preload=%s)', async (preload) => {
        const { AsyncStorage } = createAsyncStorage();
        const plugin = observablePersistAsyncStorage({ AsyncStorage, preload });
        await plugin.initialize({});
        await plugin.loadTable('missing');
        expect(plugin.getTable('missing', undefined as any)).toBeUndefined();
        expect(plugin.getTable('missing', { a: 1 })).toEqual({ a: 1 });
        expect(plugin.getMetadata('missing')).toEqual({});
    });

    test('an empty table loads as undefined, like localStorage', async () => {
        const { AsyncStorage } = createAsyncStorage();
        const asyncObs$ = observable<Record<string, string>>();
        syncObservable(
            asyncObs$,
            synced({ persist: { name: getPersistName(), plugin: observablePersistAsyncStorage({ AsyncStorage }) } }),
        );
        const localObs$ = observable<Record<string, string>>();
        syncObservable(
            localObs$,
            synced({ persist: { name: getPersistName(), plugin: ObservablePersistLocalStorage } }),
        );
        await promiseTimeout(1);

        expect(asyncObs$.get()).toBeUndefined();
        expect(localObs$.get()).toBeUndefined();
    });

    test('a saved table still loads its value', async () => {
        const name = getPersistName();
        const { AsyncStorage } = createAsyncStorage([[name, '{"a":"1"}']]);
        const obs$ = observable<Record<string, string>>();
        syncObservable(obs$, synced({ persist: { name, plugin: observablePersistAsyncStorage({ AsyncStorage }) } }));
        await promiseTimeout(1);

        expect(obs$.get()).toEqual({ a: '1' });
    });
});
