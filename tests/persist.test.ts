import { symbolSaveValue } from '../src/ObsPersistFirebaseBase';
import { obsProxy, PersistOptionsRemote } from '../src';
import { mapPersistences, obsPersist } from '../src/ObsPersist';
import { ObsPersistLocalStorage } from '../src/web/ObsPersistLocalStorage';
import { ObsPersistFirebaseJest } from './ObsPersistFirebaseJest';

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

// @ts-ignore
global.localStorage = new LocalStorageMock();

describe('Persist local', () => {
    test('Local', () => {
        const obs = obsProxy({});

        obsPersist(obs, {
            local: 'jestlocal',
            localPersistence: ObsPersistLocalStorage,
        });

        obs.set({ test: 'hello' });

        const localValue = global.localStorage.getItem('jestlocal');

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        // obs2 should load with the same value it was just saved as
        const obs2 = obsProxy({});
        obsPersist(obs2, {
            local: 'jestlocal',
            localPersistence: ObsPersistLocalStorage,
        });

        expect(obs2.value).toEqual({ test: 'hello' });
    });
});

describe('Persist remote', () => {
    test('Pending after save', () => {
        const obs = obsProxy({ test: { test2: 'hello', test3: 'hello2' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.test2 = 'hi';

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('__SAVE__')).saves;

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': 'hi',
        });

        obs.test.test3 = 'hi2';

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' }, test3: { [symbolSaveValue]: 'hi2' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
        });

        obs.test = { test2: 'test2 hi', test3: 'test3 hi' };

        expect(pending).toEqual({
            test: { [symbolSaveValue]: { test2: 'test2 hi', test3: 'test3 hi' } },
        });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test': { test2: 'test2 hi', test3: 'test3 hi' },
        });

        obs.test.test3 = 'test33333';

        expect(pending).toEqual({
            test: { [symbolSaveValue]: { test2: 'test2 hi', test3: 'test33333' } },
        });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test': { test2: 'test2 hi', test3: 'test33333' },
        });
    });
});
