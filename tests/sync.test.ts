import { observable, syncState } from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { BasicValue, getPersistName, ObservablePersistLocalStorage, promiseTimeout } from './testglobals';

jest?.setTimeout?.(1000);

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});

describe('sync()', () => {
    test('sync() triggers sync', async () => {
        const persistName = getPersistName();
        let numLists = 0;
        const serverState = [{ ...ItemBasicValue(), updatedAt: 1 }];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    numLists++;
                    return promiseTimeout(0, serverState);
                },
                create: async (input) => {
                    return { ...input, updatedAt: 2 };
                },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        const state$ = syncState(obs$);

        expect(numLists).toEqual(0);

        obs$.get();

        expect(numLists).toEqual(1);

        const doSync = () => {
            serverState[0].updatedAt++;
            state$.sync();
        };
        doSync();
        expect(numLists).toEqual(2);
        doSync();
        expect(numLists).toEqual(3);
        doSync();
        expect(numLists).toEqual(4);
    });
    test('sync() triggers sync without needing a get', async () => {
        const persistName = getPersistName();
        let numLists = 0;
        const serverState = [{ ...ItemBasicValue(), updatedAt: 1 }];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    numLists++;
                    return promiseTimeout(0, serverState);
                },
                create: async (input) => {
                    return { ...input, updatedAt: 2 };
                },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        const state$ = syncState(obs$);

        expect(numLists).toEqual(0);

        const doSync = () => {
            serverState[0].updatedAt++;
            state$.sync();
        };
        doSync();
        expect(numLists).toEqual(1);
        doSync();
        expect(numLists).toEqual(2);
        doSync();
        expect(numLists).toEqual(3);
    });
    test('sync({ resetLastSync: true }) clears lastSync before list', async () => {
        const persistName = getPersistName();
        let updatedAt = 1;
        const serverState = [{ ...ItemBasicValue(), updatedAt }];
        const lastSyncCalls: Array<number | undefined> = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: (params) => {
                    lastSyncCalls.push(params.lastSync);
                    return promiseTimeout(0, serverState);
                },
                create: async (input) => ({ ...input, updatedAt: updatedAt++ }),
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        const state$ = syncState(obs$);

        obs$.get();
        await promiseTimeout(0);
        expect(lastSyncCalls).toHaveLength(1);
        expect(lastSyncCalls[0]).toBeUndefined();

        await state$.sync();
        expect(lastSyncCalls).toHaveLength(2);
        expect(lastSyncCalls[1]).not.toBeUndefined();

        await state$.sync({ resetLastSync: true });
        expect(lastSyncCalls).toHaveLength(3);
        expect(lastSyncCalls[2]).toBeUndefined();

        await state$.sync();
        expect(lastSyncCalls).toHaveLength(4);
        expect(lastSyncCalls[1]).not.toBeUndefined();
    });
});
