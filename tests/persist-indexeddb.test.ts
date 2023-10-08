import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { observable } from '../src/observable';
import type { ObservablePersistLocal } from '../src/observableInterfaces';
import { ObservablePersistIndexedDB } from '../src/persist-plugins/indexeddb';
import { configureObservablePersistence } from '../src/persist/configureObservablePersistence';
import { mapPersistences, persistObservable } from '../src/persist/persistObservable';
import { when } from '../src/when';

const TableName = 'jestlocal';
const persistLocalOptions = {
    indexedDB: {
        databaseName: 'state',
        version: 1,
        tableNames: [TableName],
    },
};
configureObservablePersistence({
    pluginLocal: ObservablePersistIndexedDB,
    localOptions: persistLocalOptions,
});
jest.setTimeout(50);

async function reset() {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();

    const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;

    if (persist) {
        await persist.deleteTable(TableName, { name: TableName });
        await persist.initialize!(persistLocalOptions);
    }
}
async function expectIDB(value: any) {
    const out = await new Promise((resolve) => {
        const request = indexedDB.open(
            persistLocalOptions.indexedDB.databaseName,
            persistLocalOptions.indexedDB.version,
        );
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(TableName);
            const store = transaction.objectStore(TableName);
            const getAll = store.getAll();
            getAll.onsuccess = () => {
                const all = getAll.result;
                resolve(all);
            };
        };
    });
    expect(out).toEqual(value);
}
beforeEach(() => reset());
describe('Persist IDB', () => {
    test('Persist IDB save', async () => {
        const obs = observable<Record<string, any>>({});

        const { state } = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        obs['test'].set({ id: 'test', text: 'hi' });

        return expectIDB([{ id: 'test', text: 'hi' }]);
    });
    test('Persist IDB save deep', async () => {
        const obs = observable<Record<string, any>>({});

        const { state } = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        obs.test.test2.set({ text: 'hi' });

        return expectIDB([{ test2: { text: 'hi' }, id: 'test' }]);
    });
    test('Persist IDB get after save', async () => {
        const obs = observable<Record<string, any>>({});

        const { state } = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        obs['test'].set({ id: 'test', text: 'hi' });

        const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;
        await persist.initialize!(persistLocalOptions);

        const obs2 = observable<Record<string, any>>({});

        const { state: state2 } = persistObservable(obs2, {
            local: TableName,
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB save root', async () => {
        const obs = observable<Record<string, any>>({});

        const { state } = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        obs.set({ test: { id: 'test', text: 'hi' } });

        expectIDB([{ id: 'test', text: 'hi' }]);

        const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;
        await persist.initialize!(persistLocalOptions);

        const obs2 = observable<Record<string, any>>({});
        const { state: state2 } = persistObservable(obs2, {
            local: TableName,
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB with no id', async () => {
        const persist = mapPersistences.get(ObservablePersistIndexedDB)?.persist as ObservablePersistLocal;

        const obs = observable<Record<string, any>>({});

        const { state } = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        obs['test2'].set({ text: 'hi' });

        expectIDB([{ id: 'test2', text: 'hi' }]);

        await persist.initialize!(persistLocalOptions);

        const obs2 = observable<Record<string, any>>({});
        const { state: state2 } = persistObservable(obs2, {
            local: TableName,
        });

        await when(state2.isLoadedLocal);

        expect(obs2.get()).toEqual({ test2: { id: 'test2', text: 'hi' } });
    });
});
