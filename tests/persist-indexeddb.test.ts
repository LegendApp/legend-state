import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { observable } from '../src/observable';
import { observablePersistIndexedDB } from '../src/persist-plugins/indexeddb';
import { configureSynced } from '../src/sync/configureSynced';
import { mapSyncPlugins, syncObservable } from '../src/sync/syncObservable';
import type { ObservablePersistPlugin, ObservablePersistPluginOptions } from '../src/sync/syncTypes';
import { when } from '../src/when';
import { promiseTimeout } from './testglobals';

const TableNameBase = 'jestlocal';
const tableNames = Array.from({ length: 100 }, (_, i) => TableNameBase + i);
const persistOptions: ObservablePersistPluginOptions = {
    indexedDB: {
        databaseName: 'state',
        version: 1,
        tableNames,
    },
};
const myIndexedDBPlugin = observablePersistIndexedDB(persistOptions.indexedDB!);
const mySyncOptions = configureSynced({
    persist: {
        plugin: myIndexedDBPlugin,
    },
});
jest.setTimeout?.(150);

async function reset() {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();

    const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;

    if (persist) {
        await persist.initialize!(persistOptions);
    }
}
async function expectIDB(tableName: string, value: any) {
    const out = await new Promise((resolve) => {
        const request = indexedDB.open(persistOptions.indexedDB!.databaseName, persistOptions.indexedDB!.version);
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
        const persistName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs['test'].set({ id: 'test', text: 'hi' });

        return expectIDB(persistName, [{ id: 'test', text: 'hi' }]);
    });
    test('Persist IDB save deep', async () => {
        const persistName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs.test.test2.set({ text: 'hi' });

        return expectIDB(persistName, [{ test2: { text: 'hi' }, id: 'test' }]);
    });
    test('Persist IDB get after save', async () => {
        const persistName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs['test'].set({ id: 'test', text: 'hi' });

        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;
        await persist.initialize!(persistOptions);

        const obs2 = observable<Record<string, any>>({});

        const state2 = syncObservable(
            obs2,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state2.isPersistLoaded);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB save root', async () => {
        const persistName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs.set({ test: { id: 'test', text: 'hi' } });

        expectIDB(persistName, [{ id: 'test', text: 'hi' }]);

        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;
        await persist.initialize!(persistOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = syncObservable(
            obs2,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state2.isPersistLoaded);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB with no id', async () => {
        const persistName = getLocalName();
        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;

        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs['test2'].set({ text: 'hi' });

        expectIDB(persistName, [{ id: 'test2', text: 'hi' }]);

        await persist.initialize!(persistOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = syncObservable(
            obs2,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state2.isPersistLoaded);

        expect(obs2.get()).toEqual({ test2: { id: 'test2', text: 'hi' } });
    });
    test('Persist IDB with itemID and primitive', async () => {
        const persistName = getLocalName();
        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;

        const obs = observable('text');

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                    indexedDB: {
                        itemID: 'testItemId',
                    },
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs.set('hi');

        await promiseTimeout(0);

        expectIDB(persistName, [{ id: 'testItemId', __legend_primitive: 'hi' }]);

        await persist.initialize!(persistOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = syncObservable(
            obs2,
            mySyncOptions({
                persist: {
                    name: persistName,
                    indexedDB: {
                        itemID: 'testItemId',
                    },
                },
            }),
        );

        await when(state2.isPersistLoaded);

        expect(obs2.get()).toEqual('hi');
    });
    test('Persist IDB with prefixId setting individual', async () => {
        const persistName = getLocalName();
        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;

        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                    indexedDB: {
                        prefixID: 'u',
                    },
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs.id1.set({ id: 'id1', text: 'hi' });
        obs.id2.set({ id: 'id2', text: 'hi' });

        await promiseTimeout(0);

        expectIDB(persistName, [
            { id: 'u/id1', text: 'hi' },
            { id: 'u/id2', text: 'hi' },
        ]);

        await persist.initialize!(persistOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = syncObservable(
            obs2,
            mySyncOptions({
                persist: {
                    name: persistName,
                    indexedDB: {
                        prefixID: 'u',
                    },
                },
            }),
        );

        await when(state2.isPersistLoaded);

        expect(obs2.get()).toEqual({ id1: { id: 'id1', text: 'hi' }, id2: { id: 'id2', text: 'hi' } });
    });
    test('Persist IDB with prefixId', async () => {
        const persistName = getLocalName();
        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;

        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                    indexedDB: {
                        prefixID: 'u',
                    },
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs.set({ id1: { id: 'id1', text: 'hi' }, id2: { id: 'id2', text: 'hi' } });

        await promiseTimeout(0);

        expectIDB(persistName, [
            { id: 'u/id1', text: 'hi' },
            { id: 'u/id2', text: 'hi' },
        ]);

        await persist.initialize!(persistOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = syncObservable(
            obs2,
            mySyncOptions({
                persist: {
                    name: persistName,
                    indexedDB: {
                        prefixID: 'u',
                    },
                },
            }),
        );

        await when(state2.isPersistLoaded);

        expect(obs2.get()).toEqual({ id1: { id: 'id1', text: 'hi' }, id2: { id: 'id2', text: 'hi' } });
    });
    test('Persist IDB delete a row', async () => {
        const persistName = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = syncObservable(
            obs,
            mySyncOptions({
                persist: {
                    name: persistName,
                },
            }),
        );

        await when(state.isPersistLoaded);

        obs['test'].set({ id: 'test', text: 'hi' });

        await promiseTimeout(0);

        await expectIDB(persistName, [{ id: 'test', text: 'hi' }]);

        obs['test'].delete();

        await promiseTimeout(0);

        await expectIDB(persistName, []);
    });
});
