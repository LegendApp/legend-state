import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { symbolDelete } from '../src/globals';
import { observable } from '../src/observable';
import { observablePersistIndexedDB, ObservablePersistIndexedDB } from '../src/persist-plugins/indexeddb';
import { configureSynced } from '../src/sync/configureSynced';
import { mapSyncPlugins, syncObservable } from '../src/sync/syncObservable';
import type { ObservablePersistPlugin, ObservablePersistPluginOptions } from '../src/sync/syncTypes';
import { when } from '../src/when';
import { expectLog, promiseTimeout } from './testglobals';

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
    test('Persist IDB deletes an item-level symbolDelete value', async () => {
        const persistName = getLocalName();
        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;
        const config = { name: persistName };

        await persist.set(
            persistName,
            [
                {
                    path: ['test'],
                    pathTypes: ['object'],
                    valueAtPath: { id: 'test', text: 'hi' },
                    prevAtPath: undefined,
                },
            ],
            config,
        );
        await persist.set(
            persistName,
            [
                {
                    path: ['test'],
                    pathTypes: ['object'],
                    valueAtPath: symbolDelete,
                    prevAtPath: { id: 'test', text: 'hi' },
                },
            ],
            config,
        );

        await expectIDB(persistName, []);
    });
    test('Persist IDB deletes symbolDelete values in a root replacement', async () => {
        const persistName = getLocalName();
        const persist = mapSyncPlugins.get(myIndexedDBPlugin)?.plugin as ObservablePersistPlugin;
        const config = { name: persistName };

        await persist.set(
            persistName,
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: {
                        keep: { id: 'keep', text: 'keep' },
                        remove: { id: 'remove', text: 'remove' },
                    },
                    prevAtPath: {},
                },
            ],
            config,
        );
        await persist.set(
            persistName,
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: {
                        keep: { id: 'keep', text: 'keep' },
                        remove: symbolDelete,
                    },
                    prevAtPath: {
                        keep: { id: 'keep', text: 'keep' },
                        remove: { id: 'remove', text: 'remove' },
                    },
                },
            ],
            config,
        );

        await expectIDB(persistName, [{ id: 'keep', text: 'keep' }]);
    });
    test.each(['incremental', 'table'] as const)(
        'prefixed %s sentinel delete preserves other namespaces after reload',
        async (mode) => {
            const persistName = getLocalName();
            const persist = myIndexedDBPlugin as ObservablePersistPlugin;
            await persist.initialize!(persistOptions);
            const prefix = { indexedDB: { prefixID: 'p' } };
            const otherPrefix = { indexedDB: { prefixID: 'q' } };
            const write = (id: string, name: string) => [
                { path: [id], pathTypes: ['object'] as const, prevAtPath: undefined, valueAtPath: { id, name } },
            ];
            await persist.set(persistName, write('id1', 'outside') as any, {});
            await persist.set(persistName, write('id1', 'other prefix') as any, otherPrefix);
            await persist.set(persistName, write('id1', 'delete') as any, prefix);
            await persist.set(persistName, write('id2', 'keep') as any, prefix);
            await persist.set(
                persistName,
                mode === 'incremental'
                    ? [{ path: ['id1'], pathTypes: ['object'], prevAtPath: undefined, valueAtPath: symbolDelete }]
                    : [
                          {
                              path: [],
                              pathTypes: [],
                              prevAtPath: undefined,
                              valueAtPath: { id1: symbolDelete, id2: { id: 'id2', name: 'keep' } },
                          },
                      ],
                prefix,
            );
            await expectIDB(persistName, [
                { id: 'id1', name: 'outside' },
                { id: 'p/id2', name: 'keep' },
                { id: 'q/id1', name: 'other prefix' },
            ]);
            const reloaded = new ObservablePersistIndexedDB(persistOptions.indexedDB!);
            await reloaded.initialize(persistOptions);
            expect(reloaded.getTable(persistName, {}, prefix)).toEqual({ id2: { id: 'id2', name: 'keep' } });
            expect(reloaded.getTable(persistName, {}, {})).toEqual({ id1: { id: 'id1', name: 'outside' } });
            expect(reloaded.getTable(persistName, {}, otherPrefix)).toEqual({
                id1: { id: 'id1', name: 'other prefix' },
            });
        },
    );
    test('itemID nested sentinel follows ordinary undefined deletion and keeps the parent row', async () => {
        const persistName = getLocalName();
        const persist = myIndexedDBPlugin as ObservablePersistPlugin;
        await persist.initialize!(persistOptions);
        const config = { indexedDB: { prefixID: 'p', itemID: 'container' } };
        await persist.set(
            persistName,
            [{ path: [], pathTypes: [], prevAtPath: undefined, valueAtPath: { name: 'Alice', keep: true } }],
            config,
        );
        await persist.set(
            persistName,
            [{ path: ['name'], pathTypes: ['object'], prevAtPath: 'Alice', valueAtPath: symbolDelete }],
            config,
        );
        await expectIDB(persistName, [{ id: 'p/container', name: undefined, keep: true }]);
    });
    test('same-tick table marker then re-add preserves the newest row', async () => {
        const persistName = getLocalName();
        const persist = myIndexedDBPlugin as ObservablePersistPlugin;
        await persist.initialize!(persistOptions);
        const config = { indexedDB: { prefixID: 'p' } };
        await persist.set(
            persistName,
            [{ path: ['id1'], pathTypes: ['object'], prevAtPath: undefined, valueAtPath: { id: 'id1', name: 'old' } }],
            config,
        );
        const deleted = persist.set(
            persistName,
            [{ path: [], pathTypes: [], prevAtPath: undefined, valueAtPath: { id1: symbolDelete } }],
            config,
        );
        const readded = persist.set(
            persistName,
            [{ path: ['id1'], pathTypes: ['object'], prevAtPath: undefined, valueAtPath: { id: 'id1', name: 'new' } }],
            config,
        );
        await Promise.all([deleted, readded]);
        await expectIDB(persistName, [{ id: 'p/id1', name: 'new' }]);
    });
    test('Persist without a name errors', async () => {
        const obs = observable<Record<string, any>>({});

        expectLog(
            () => {
                syncObservable(obs, {
                    persist: {
                        plugin: myIndexedDBPlugin,
                    },
                });
            },
            '[legend-state] Trying to syncObservable without `name` defined. Please include a `name` property in the `persist` configuration.',
            'warn',
            expect,
        );
    });
});
