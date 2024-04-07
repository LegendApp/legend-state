import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { observable } from '../src/observable';
import type { ObservablePersistLocal } from '../src/persistTypes';
import { ObservablePersistIndexedDB } from '../src/persist-plugins/indexeddb';
import { configureObservablePersistence } from '../src/persist/configureObservablePersistence';
import { mapPersistences, persistObservable } from '../src/persist/persistObservable';
import { when } from '../src/when';

const TableNameBase = 'jestlocal';
const tableNames = Array.from({ length: 100 }, (_, i) => TableNameBase + i);
const persistLocalOptions = {
    indexedDB: {
        databaseName: 'state',
        version: 1,
        tableNames,
    },
};
configureObservablePersistence({
    pluginLocal: ObservablePersistIndexedDB,
    localOptions: persistLocalOptions,
});
jest.setTimeout?.(150);

async function reset() {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();

    const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;

    if (persist) {
        await persist.initialize!(persistLocalOptions);
    }
}
async function expectIDB(tableName: string, value: any) {
    const out = await new Promise((resolve) => {
        const request = indexedDB.open(
            persistLocalOptions.indexedDB.databaseName,
            persistLocalOptions.indexedDB.version,
        );
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
        const local = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local,
        });

        await when(state.isLoadedLocal);

        obs['test'].set({ id: 'test', text: 'hi' });

        return expectIDB(local, [{ id: 'test', text: 'hi' }]);
    });
    test('Persist IDB save deep', async () => {
        const local = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local,
        });

        await when(state.isLoadedLocal);

        obs.test.test2.set({ text: 'hi' });

        return expectIDB(local, [{ test2: { text: 'hi' }, id: 'test' }]);
    });
    test('Persist IDB get after save', async () => {
        const local = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local,
        });

        await when(state.isLoadedLocal);

        obs['test'].set({ id: 'test', text: 'hi' });

        const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;
        await persist.initialize!(persistLocalOptions);

        const obs2 = observable<Record<string, any>>({});

        const state2 = persistObservable(obs2, {
            local,
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB save root', async () => {
        const local = getLocalName();
        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local,
        });

        await when(state.isLoadedLocal);

        obs.set({ test: { id: 'test', text: 'hi' } });

        expectIDB(local, [{ id: 'test', text: 'hi' }]);

        const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;
        await persist.initialize!(persistLocalOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = persistObservable(obs2, {
            local,
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB with no id', async () => {
        const local = getLocalName();
        const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;

        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local,
        });

        await when(state.isLoadedLocal);

        obs['test2'].set({ text: 'hi' });

        expectIDB(local, [{ id: 'test2', text: 'hi' }]);

        await persist.initialize!(persistLocalOptions);

        const obs2 = observable<Record<string, any>>({});
        const state2 = persistObservable(obs2, {
            local,
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test2: { id: 'test2', text: 'hi' } });
    });
});
