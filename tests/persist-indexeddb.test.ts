import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { observable } from '../src/observable';
import type { ObservablePersistPlugin, ObservableCachePluginOptions } from '../src/syncTypes';
import { ObservablePersistIndexedDB } from '../src/persist-plugins/indexeddb';
import { configureObservableSync } from '../src/sync/configureObservableSync';
import { mapSyncPlugins, syncObservable } from '../src/sync/syncObservable';
import { when } from '../src/when';

const TableNameBase = 'jestlocal';
const tableNames = Array.from({ length: 100 }, (_, i) => TableNameBase + i);
const cacheOptions: ObservableCachePluginOptions = {
    indexedDB: {
        databaseName: 'state',
        version: 1,
        tableNames,
    },
};
configureObservableSync({
    cache: {
        plugin: ObservablePersistIndexedDB,
        ...cacheOptions,
    },
});
jest.setTimeout?.(150);

async function reset() {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();

    const persist = mapSyncPlugins.get(ObservablePersistIndexedDB)?.plugin as ObservablePersistPlugin;

    if (persist) {
        await persist.initialize!(cacheOptions);
    }
}
async function expectIDB(tableName: string, value: any) {
    const out = await new Promise((resolve) => {
        const request = indexedDB.open(cacheOptions.indexedDB!.databaseName, cacheOptions.indexedDB!.version);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(tableName);
            const store = transaction.objectStore(tableName);
            const getAll = store.getAll();
            getAll.onsuccess = () => {
                const all = getAll.result;
                resolve(all);
            };
        };
    });
    expect(out).toEqual(value);
}
beforeAll(() => reset());
let localNum = 0;
const getLocalName = () => tableNames[localNum++];

describe('Persist IDB', () => {
    test('Persist IDB save', async () => {
        const cacheName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(obs, {
            persist: {
                name: cacheName,
            },
        });

        await when(state.isLoadedLocal);

        obs['test'].set({ id: 'test', text: 'hi' });

        return expectIDB(cacheName, [{ id: 'test', text: 'hi' }]);
    });
    test('Persist IDB save deep', async () => {
        const cacheName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(obs, {
            persist: {
                name: cacheName,
            },
        });

        await when(state.isLoadedLocal);

        obs.test.test2.set({ text: 'hi' });

        return expectIDB(cacheName, [{ test2: { text: 'hi' }, id: 'test' }]);
    });
    test('Persist IDB get after save', async () => {
        const cacheName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(obs, {
            persist: {
                name: cacheName,
            },
        });

        await when(state.isLoadedLocal);

        obs['test'].set({ id: 'test', text: 'hi' });

        const persist = mapSyncPlugins.get(ObservablePersistIndexedDB)?.plugin as ObservablePersistPlugin;
        await persist.initialize!(cacheOptions);

        const obs2 = observable<Record<string, any>>({});

        const state2 = syncObservable(obs2, {
            persist: {
                name: cacheName,
            },
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB save root', async () => {
        const cacheName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(obs, {
            persist: {
                name: cacheName,
            },
        });

        await when(state.isLoadedLocal);

        obs.set({ test: { id: 'test', text: 'hi' } });

        expectIDB(cacheName, [{ id: 'test', text: 'hi' }]);

        const persist = mapSyncPlugins.get(ObservablePersistIndexedDB)?.plugin as ObservablePersistPlugin;
        await persist.initialize!(cacheOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = syncObservable(obs2, {
            persist: {
                name: cacheName,
            },
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB with no id', async () => {
        const cacheName = getLocalName();
        const persist = mapSyncPlugins.get(ObservablePersistIndexedDB)?.plugin as ObservablePersistPlugin;

        const obs = observable<Record<string, any>>({});

        const state = syncObservable(obs, {
            persist: {
                name: cacheName,
            },
        });

        await when(state.isLoadedLocal);

        obs['test2'].set({ text: 'hi' });

        expectIDB(cacheName, [{ id: 'test2', text: 'hi' }]);

        await persist.initialize!(cacheOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = syncObservable(obs2, {
            persist: {
                name: cacheName,
            },
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test2: { id: 'test2', text: 'hi' } });
    });
});
