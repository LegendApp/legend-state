import 'fake-indexeddb/auto';
import { observable } from '../src/observable';
import type { ObservablePersistLocal } from '../src/observableInterfaces';
import { configureObservablePersistence } from '../src/persist/configureObservablePersistence';
import { ObservablePersistIndexedDB } from '../src/persist/indexeddb';
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
    persistLocal: ObservablePersistIndexedDB,
    persistLocalOptions,
});
async function expectIDB(value: any) {
    const out = await new Promise((resolve) => {
        const request = indexedDB.open(
            persistLocalOptions.indexedDB.databaseName,
            persistLocalOptions.indexedDB.version
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
describe('Persist IDB', () => {
    test('Persist IDB save', async () => {
        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        obs['test'].set({ id: 'test', text: 'hi' });

        return expectIDB([{ id: 'test', text: 'hi' }]);
    });
    test('Persist IDB get', async () => {
        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        expect(obs.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
    test('Persist IDB initialize', async () => {
        const persist = mapPersistences.get(ObservablePersistIndexedDB) as ObservablePersistLocal;

        await persist.initialize(persistLocalOptions);

        const obs = observable<Record<string, any>>({});

        const state = persistObservable(obs, {
            local: TableName,
        });

        await when(state.isLoadedLocal);

        expect(obs.get()).toEqual({ test: { id: 'test', text: 'hi' } });
    });
});
