import { symbolSaveValue } from '../src/ObsPersistFirebaseBase';
import { getObsModified, listenToObs, obsProxy, onTrue, PersistOptionsRemote } from '../src';
import { mapPersistences, obsPersist } from '../src/ObsPersist';
import { ObsPersistLocalStorage } from '../src/web/ObsPersistLocalStorage';
import { ObsPersistFirebaseJest } from './ObsPersistFirebaseJest';
import { symbolDateModified } from '../src/globals';

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

jest.setTimeout(100000);

beforeEach(() => {
    global.localStorage.clear();
    const local = mapPersistences.get(ObsPersistLocalStorage) as ObsPersistLocalStorage;
    if (local) {
        local.data = {};
    }

    const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;
    if (remote) {
        remote['_pendingSaves2'].delete(`/test/__SAVE__/s/`);
    }
});

function initializeRemote(obj: object) {
    const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

    remote.initializeRemote({
        test: {
            testuid: {
                s: obj,
            },
        },
    });
}

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

describe('Persist remote save', () => {
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

    test('Pending after save with modified primitive', () => {
        const obs = obsProxy({ test: { test2: 'hello', test3: 'hello2' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: ['test/test2'],
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
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.test3 = 'hi2';

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' }, test3: { [symbolSaveValue]: 'hi2' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
            '/test/testuid/s/test/test3': 'hi2',
        });
    });

    test('Pending after save with modified object', () => {
        const obs = obsProxy({ test: { test2: 'hello', test3: 'hello2' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: ['test'],
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test = { test2: 'hi', test3: 'hi2' };

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('__SAVE__')).saves;

        expect(pending).toEqual({ test: { [symbolSaveValue]: { test2: 'hi', test3: 'hi2' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test': {
                '@': '__serverTimestamp',
                test2: 'hi',
                test3: 'hi2',
            },
        });
    });

    test('queryByModified with *', () => {
        const obs = obsProxy({
            test: { test2: 'hello', test3: 'hello2', test4: { test5: 'hello3', test6: { test7: 'hello4' } } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: ['*'],
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

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
        });

        obs.test.test3 = 'hi2';

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
        });

        obs.test.test4.test5 = 'hi3';

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
            '/test/testuid/s/test/test4/test5': 'hi3',
        });

        obs.test.test4.test6.test7 = 'hi4';

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
            '/test/testuid/s/test/test4/test5': 'hi3',
            '/test/testuid/s/test/test4/test6/test7': 'hi4',
        });
    });

    test('queryByModified with path/*', () => {
        const obs = obsProxy({
            test: { test2: 'hello', test3: 'hello2', test4: { test5: 'hello3', test6: { test7: 'hello4' } } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: ['test/*'],
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

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.test3 = 'hi2';

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
            '/test/testuid/s/test/test3': {
                '@': '__serverTimestamp',
                _: 'hi2',
            },
        });

        obs.test.test4.test5 = 'hi3';

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
            '/test/testuid/s/test/test3': {
                '@': '__serverTimestamp',
                _: 'hi2',
            },
            '/test/testuid/s/test/test4/@': '__serverTimestamp',
            '/test/testuid/s/test/test4/test5': 'hi3',
        });

        obs.test.test4.test6.test7 = 'hi4';

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
            '/test/testuid/s/test/test3': {
                '@': '__serverTimestamp',
                _: 'hi2',
            },
            '/test/testuid/s/test/test4/@': '__serverTimestamp',
            '/test/testuid/s/test/test4/test5': 'hi3',
            '/test/testuid/s/test/test4/test6/test7': 'hi4',
        });
    });
});

describe('Remote load', () => {
    test('Persist remote load dateModified', async () => {
        const obs = obsProxy({ test: { test2: '', test3: '' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: ['*'],
            },
        };

        initializeRemote({
            test: {
                '@': '1000',
                test2: 'hi',
                test3: 'hi2',
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.value).toEqual({
            test: {
                test2: 'hi',
                test3: 'hi2',
                [symbolDateModified]: '1000',
            },
        });

        expect(getObsModified(obs.test)).toEqual('1000');
    });
});

// TODO onChange
// TODO fieldtranslator
// TODO fieldtranslator keep datemodified symbol
