import { getObsModified, obsProxy, onTrue, PersistOptionsRemote, ProxyValue } from '../src';
import { symbolDateModified } from '../src/globals';
import { mapPersistences, obsPersist } from '../src/ObsPersist';
import { symbolSaveValue } from '../src/ObsPersistFirebaseBase';
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

function promiseTimeout() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

// @ts-ignore
global.localStorage = new LocalStorageMock();

// jest.setTimeout(100000);

beforeEach(() => {
    global.localStorage.clear();
    const local = mapPersistences.get(ObsPersistLocalStorage) as ObsPersistLocalStorage;
    if (local) {
        local.data = {};
    }

    const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;
    if (remote) {
        remote['_pendingSaves2'].delete(`/test/testuid/s/`);
        remote['listeners'] = {};
        remote['remoteData'] = {};
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

function modifyRemote(path: string, obj: object) {
    const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

    const basePath = '/test/testuid/s/';

    remote.modify(basePath, path, obj);
}

describe('Persist local', () => {
    test('Saves to local', () => {
        const obs = obsProxy({ test: '' });

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

        expect(obs2).toEqual({ test: 'hello' });
    });
    test('Loads from local with modified', () => {
        global.localStorage.setItem(
            'jestlocal',
            JSON.stringify({
                test: { '@': 1000, test2: 'hi2', test3: 'hi3' },
                test4: { test5: { '@': 1001, test6: 'hi6' } },
                test7: { test8: 'hi8' },
            })
        );

        const obs = obsProxy({
            test: { test2: '', test3: '' },
            test4: { test5: { test6: '' } },
            test7: { test8: '' },
        });

        obsPersist(obs, {
            local: 'jestlocal',
            localPersistence: ObsPersistLocalStorage,
        });

        expect(obs).toEqual({
            test: { [symbolDateModified]: 1000, test2: 'hi2', test3: 'hi3' },
            test4: { test5: { [symbolDateModified]: 1001, test6: 'hi6' } },
            test7: { test8: 'hi8' },
        });
    });
});

describe('Persist remote save', () => {
    test('Pending after save', async () => {
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

        obs.test.set('test2', 'hi');

        await promiseTimeout();

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('testuid')).saves;

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': 'hi',
        });

        obs.test.set('test3', 'hi2');

        await promiseTimeout();

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' }, test3: { [symbolSaveValue]: 'hi2' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
        });

        obs.test.set({ test2: 'test2 hi', test3: 'test3 hi' });

        await promiseTimeout();

        expect(pending).toEqual({
            test: { [symbolSaveValue]: { test2: 'test2 hi', test3: 'test3 hi' } },
        });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test': { test2: 'test2 hi', test3: 'test3 hi' },
        });

        obs.test.set('test3', 'test33333');

        await promiseTimeout();

        expect(pending).toEqual({
            test: { [symbolSaveValue]: { test2: 'test2 hi', test3: 'test33333' } },
        });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test': { test2: 'test2 hi', test3: 'test33333' },
        });

        await remote['promiseSaved'].promise;

        expect(remote['remoteData']).toEqual({
            test: {
                testuid: {
                    s: {
                        test: {
                            test2: 'test2 hi',
                            test3: 'test33333',
                        },
                    },
                },
            },
        });
    });

    test('Pending after save with modified primitive', async () => {
        const obs = obsProxy({ test: { test2: 'hello', test3: 'hello2' } });

        const remoteOptions: PersistOptionsRemote<ProxyValue<typeof obs>> = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: { test: true },
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test2', 'hi');

        await promiseTimeout();

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('testuid')).saves;

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.set('test3', 'hi2');

        await promiseTimeout();

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' }, test3: { [symbolSaveValue]: 'hi2' } } });
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

        await remote['promiseSaved'].promise;
        await promiseTimeout();

        // Should have saved with timestamp to local storage
        expect(JSON.parse(global.localStorage.getItem('jestremote'))).toEqual({
            test: { '@': '__serverTimestamp', test2: 'hi', test3: 'hi2' },
        });
    });

    test('Pending after save with modified object', async () => {
        const obs = obsProxy({ test: { test2: 'hello', test3: 'hello2' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: true,
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set({ test2: 'hi', test3: 'hi2' });

        await promiseTimeout();

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('testuid')).saves;

        expect(pending).toEqual({ test: { [symbolSaveValue]: { test2: 'hi', test3: 'hi2' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test': {
                '@': '__serverTimestamp',
                test2: 'hi',
                test3: 'hi2',
            },
        });

        await remote['promiseSaved'].promise;
        await promiseTimeout();

        // Should have saved with timestamp to local storage
        expect(JSON.parse(global.localStorage.getItem('jestremote'))).toEqual({
            test: { '@': '__serverTimestamp', test2: 'hi', test3: 'hi2' },
        });
    });

    test('queryByModified with queryByModified at root', async () => {
        const obs = obsProxy({
            test: { test2: 'hello', test3: 'hello2', test4: { test5: 'hello3', test6: { test7: 'hello4' } } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: true,
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test2', 'hi');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
        });

        obs.test.set('test3', 'hi2');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
        });

        obs.test.test4.set('test5', 'hi3');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
            '/test/testuid/s/test/test4/test5': 'hi3',
        });

        obs.test.test4.test6.set('test7', 'hi4');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
            '/test/testuid/s/test/test4/test5': 'hi3',
            '/test/testuid/s/test/test4/test6/test7': 'hi4',
        });

        await remote['promiseSaved'].promise;
        await promiseTimeout();

        // Should have saved with timestamp to local storage
        expect(JSON.parse(global.localStorage.getItem('jestremote'))).toEqual({
            test: {
                '@': '__serverTimestamp',
                test2: 'hi',
                test3: 'hi2',
                test4: {
                    test5: 'hi3',
                    test6: {
                        test7: 'hi4',
                    },
                },
            },
        });
    });

    test('save queryByModified at root', async () => {
        const obs = obsProxy({
            test: { test2: 'hello', test3: 'hello2', test4: { test5: 'hello3', test6: { test7: 'hello4' } } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: { test: true },
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test2', 'hi');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.set('test3', 'hi2');

        await promiseTimeout();

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

        obs.test.test4.set('test5', 'hi3');

        await promiseTimeout();

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

        obs.test.test4.test6.set('test7', 'hi4');

        await promiseTimeout();

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

        await remote['promiseSaved'].promise;
        await promiseTimeout();

        // Should have saved with timestamp to local storage
        expect(JSON.parse(global.localStorage.getItem('jestremote'))).toEqual({
            test: {
                '@': '__serverTimestamp',
                test2: 'hi',
                test3: 'hi2',
                test4: {
                    '@': '__serverTimestamp',
                    test5: 'hi3',
                    test6: {
                        test7: 'hi4',
                    },
                },
            },
        });
    });

    test('save queryByModified with path/* 2', async () => {
        const obs = obsProxy({
            test: { test2: 'hello', test3: 'hello2', test4: { test5: 'hello3', test6: { test7: 'hello4' } } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: { test: true },
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test2', 'hi');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.test4.test6.set('test7', 'hi4');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
            '/test/testuid/s/test/test4/@': '__serverTimestamp',
            '/test/testuid/s/test/test4/test6/test7': 'hi4',
        });

        await remote['promiseSaved'].promise;
        await promiseTimeout();

        // Should have saved with timestamp to local storage
        expect(JSON.parse(global.localStorage.getItem('jestremote'))).toEqual({
            test: {
                '@': '__serverTimestamp',
                test2: 'hi',
                test3: 'hello2',
                test4: {
                    '@': '__serverTimestamp',
                    test5: 'hello3',
                    test6: {
                        test7: 'hi4',
                    },
                },
            },
        });
    });

    test('save queryByModified with dict', async () => {
        const obs = obsProxy<{ test: Record<string, Record<string, { text: string }>> }>({
            test: {},
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: { test: '*' },
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test1', { container1: { text: 'hi' }, container2: { text: 'hi2' } });
        obs.test.set('test2', { container3: { text: 'hi3' }, container4: { text: 'hi4' } });

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test1': {
                container1: {
                    '@': '__serverTimestamp',
                    text: 'hi',
                },
                container2: {
                    '@': '__serverTimestamp',
                    text: 'hi2',
                },
            },
            '/test/testuid/s/test/test2': {
                container3: {
                    '@': '__serverTimestamp',
                    text: 'hi3',
                },
                container4: {
                    '@': '__serverTimestamp',
                    text: 'hi4',
                },
            },
        });

        await remote['promiseSaved'].promise;
    });

    test('save queryByModified with dict and field transforms', async () => {
        const obs = obsProxy<{ test: Record<string, Record<string, { text: string }>> }>({
            test: {},
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: { test: '*' },
                fieldTransforms: {
                    test: {
                        _: 't',
                        __dict: {
                            text: 't2',
                        },
                    },
                },
            },
        };

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test1', { container1: { text: 'hi' }, container2: { text: 'hi2' } });
        obs.test.set('test2', { container3: { text: 'hi3' }, container4: { text: 'hi4' } });

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/t/test1': {
                container1: {
                    '@': '__serverTimestamp',
                    text: 'hi',
                },
                container2: {
                    '@': '__serverTimestamp',
                    text: 'hi2',
                },
            },
            '/test/testuid/s/t/test2': {
                container3: {
                    '@': '__serverTimestamp',
                    text: 'hi3',
                },
                container4: {
                    '@': '__serverTimestamp',
                    text: 'hi4',
                },
            },
        });

        await remote['promiseSaved'].promise;
    });
});

describe('Remote load', () => {
    test('Persist remote load basic object', async () => {
        const obs = obsProxy({ test: '', test2: '' });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
            },
        };

        initializeRemote({
            test: 'hi1',
            test2: 'hi2',
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        expect(obs).toEqual({
            test: 'hi1',
            test2: 'hi2',
        });

        expect(getObsModified(obs)).toBeUndefined();
    });
    test('Persist remote load dateModified', async () => {
        const obs = obsProxy({ test: { test2: '', test3: '' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: true,
            },
        };

        initializeRemote({
            test: {
                '@': 1000,
                test2: 'hi',
                test3: 'hi2',
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        expect(obs).toEqual({
            test: {
                test2: 'hi',
                test3: 'hi2',
                [symbolDateModified]: 1000,
            },
        });

        expect(getObsModified(obs.test)).toEqual(1000);
    });

    test('Persist remote load complex modified', async () => {
        const obs = obsProxy({ test: { test2: '', test3: '' }, test4: { test5: { test6: '' } }, test7: { test8: '' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    test: true,
                    test4: true,
                },
            },
        };

        initializeRemote({
            test: {
                test2: {
                    '@': 1000,
                    _: 'hi2',
                },
                test3: {
                    '@': 1000,
                    _: 'hi3',
                },
            },
            test4: {
                test5: {
                    '@': 1000,
                    test6: 'hi6',
                },
            },
            test7: {
                test8: 'hi8',
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        expect(obs).toEqual({
            test: {
                test2: 'hi2',
                test3: 'hi3',
                [symbolDateModified]: 1000,
            },
            test4: {
                test5: {
                    [symbolDateModified]: 1000,
                    test6: 'hi6',
                },
            },
            test7: {
                test8: 'hi8',
            },
        });

        expect(getObsModified(obs.test)).toEqual(1000);
    });
    test('Persist remote load complex modified deep', async () => {
        const obs = obsProxy({
            test: { test2: { test3: { id: '' }, test4: { id: '' } } },
            test6: { test7: { id: '' } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    test: {
                        test2: true,
                    },
                    test6: true,
                },
            },
        };

        initializeRemote({
            test: {
                test2: {
                    test3: {
                        '@': 1000,
                        id: 'hi3',
                    },
                    test4: {
                        '@': 1000,
                        id: 'hi4',
                    },
                },
            },
            test6: {
                test7: {
                    '@': 1000,
                    id: 'hi7',
                },
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        expect(obs).toEqual({
            test: {
                test2: {
                    test3: { id: 'hi3', [symbolDateModified]: 1000 },
                    test4: { id: 'hi4', [symbolDateModified]: 1000 },
                },
            },
            test6: { test7: { id: 'hi7', [symbolDateModified]: 1000 } },
        });
    });
    test('Persist remote load complex modified deep with other keys', async () => {
        const obs = obsProxy({
            test: { test2: { test3: { id: '' }, test4: { id: '' } }, test5: { test55: '' } },
            test6: { test7: { id: '' } },
            test8: { test9: '' },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    test: {
                        test2: true,
                    },
                    test6: true,
                },
            },
        };

        initializeRemote({
            test: {
                test2: {
                    test3: {
                        '@': 1000,
                        id: 'hi3',
                    },
                    test4: {
                        '@': 1000,
                        id: 'hi4',
                    },
                },
                test5: { test55: 'hi5' },
            },
            test6: {
                test7: {
                    '@': 1000,
                    id: 'hi7',
                },
            },
            test8: {
                test9: 'hi9',
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        expect(obs).toEqual({
            test: {
                test2: {
                    test3: { id: 'hi3', [symbolDateModified]: 1000 },
                    test4: { id: 'hi4', [symbolDateModified]: 1000 },
                },
                test5: { test55: 'hi5' },
            },
            test6: { test7: { id: 'hi7', [symbolDateModified]: 1000 } },
            test8: { test9: 'hi9' },
        });
    });

    test('Persist remote load with local timestamps', async () => {
        global.localStorage.setItem(
            'jestlocal',
            JSON.stringify({
                test: { '@': 1000, test2: 'hi2', test3: 'hi3' },
                test4: { test5: { '@': 1001, test6: 'hi6' } },
                test7: { test8: 'hi8' },
            })
        );

        const obs = obsProxy({
            test: { test2: '', test3: '' },
            test4: { test5: { test6: '' } },
            test7: { test8: '' },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    test: true,
                    test4: true,
                },
            },
        };

        initializeRemote({
            test: {
                test2: {
                    '@': 1000,
                    _: 'hi2',
                },
                test3: {
                    '@': 1000,
                    _: 'hi3',
                },
            },
            test4: {
                test5: {
                    '@': 1002,
                    test6: 'hihi6',
                },
            },
            test7: {
                test8: 'hi8',
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        expect(obs).toEqual({
            test: {
                test2: 'hi2',
                test3: 'hi3',
                [symbolDateModified]: 1000,
            },
            test4: {
                test5: {
                    [symbolDateModified]: 1002,
                    test6: 'hihi6',
                },
            },
            test7: {
                test8: 'hi8',
            },
        });

        expect(getObsModified(obs.test)).toEqual(1000);
        expect(getObsModified(obs.test4.test5)).toEqual(1002);
    });
});

describe('Remote change', () => {
    test('onChange', async () => {
        const obs = obsProxy({ test: { test2: '', test3: '' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
            },
        };

        initializeRemote({
            test: {
                '@': 1000,
                test2: 'hi',
                test3: 'hi3',
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        modifyRemote('test', { '@': 1001, test2: 'hello2' });

        expect(obs.test.get()).toEqual({
            test2: 'hello2',
            test3: 'hi3',
            [symbolDateModified]: 1001,
        });

        expect(obs.test.test2).toEqual('hello2');
        expect(obs.test.test3).toEqual('hi3');
        expect(obs.test['@']).toEqual(undefined);
        expect(obs.test.get()['@']).toEqual(undefined);
        expect(getObsModified(obs.test)).toEqual(1001);
    });

    test('onChange with queryByModified', async () => {
        const obs = obsProxy({ test: { test2: { test22: '' }, test3: { test33: '' } } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: { test: true },
            },
        };

        initializeRemote({
            test: {
                test2: { '@': 1000, test22: 'hi' },
                test3: { '@': 1000, test33: 'hi3' },
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: remoteOptions,
        });

        await onTrue(state, 'isLoadedRemote');

        modifyRemote('test/test2', { '@': 1001, test22: 'hello2' });

        expect(obs.test.get()).toEqual({
            test2: {
                test22: 'hello2',
                [symbolDateModified]: 1001,
            },
            test3: {
                test33: 'hi3',
                [symbolDateModified]: 1000,
            },
        });

        expect(obs.test.test2.test22).toEqual('hello2');
        expect(obs.test.test3.test33).toEqual('hi3');

        expect(obs.test.test2['@']).toEqual(undefined);
        expect(obs.test.test3['@']).toEqual(undefined);
        expect(obs.test['@']).toEqual(undefined);

        expect(getObsModified(obs.test.test3)).toEqual(1000);
        expect(getObsModified(obs.test.test2)).toEqual(1001);
    });
});

describe('Field transform', () => {
    test('Field transform in', async () => {
        const obs = obsProxy({
            test: { test2: '', test3: '' },
            test4: { test5: { test6: '' } },
            test7: { test8: '' },
        });

        initializeRemote({
            t: {
                t2: {
                    '@': 1000,
                    _: 'hi2',
                },
                t3: {
                    '@': 1000,
                    _: 'hi3',
                },
            },
            t4: {
                // This is a dictionary so don't convert its ids
                test5: {
                    '@': 1002,
                    t6: 'hihi6',
                },
            },
            t7: {
                t8: 'hi8',
            },
        });

        const state = obsPersist(obs, {
            remotePersistence: ObsPersistFirebaseJest,
            remote: {
                requireAuth: true,
                firebase: {
                    syncPath: (uid) => `/test/${uid}/s/`,
                    fieldTransforms: {
                        test: {
                            _: 't',
                            __obj: {
                                test2: 't2',
                                test3: 't3',
                            },
                        },
                        test4: {
                            _: 't4',
                            __dict: {
                                test6: 't6',
                            },
                        },
                        test7: {
                            _: 't7',
                            __obj: {
                                test8: 't8',
                            },
                        },
                    },
                    queryByModified: {
                        test: true,
                        test4: true,
                    },
                },
            },
        });

        await onTrue(state, 'isLoadedRemote');

        expect(obs).toEqual({
            test: {
                test2: 'hi2',
                test3: 'hi3',
                [symbolDateModified]: 1000,
            },
            test4: {
                test5: {
                    [symbolDateModified]: 1002,
                    test6: 'hihi6',
                },
            },
            test7: {
                test8: 'hi8',
            },
        });
    });
    test('Field transform out', async () => {
        const obs = obsProxy({
            test: { test2: '', test3: '' },
            test4: { test5: { test6: '' } },
            test7: { test8: '' },
        });

        const state = obsPersist(obs, {
            local: 'jestremote',
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            remote: {
                requireAuth: true,
                firebase: {
                    syncPath: (uid) => `/test/${uid}/s/`,
                    queryByModified: { test: true, test4: true },
                    fieldTransforms: {
                        test: {
                            _: 't',
                            __obj: {
                                test2: 't2',
                                test3: 't3',
                            },
                        },
                        test4: {
                            _: 't4',
                            __dict: {
                                test6: 't6',
                            },
                        },
                        test7: {
                            _: 't7',
                            __obj: {
                                test8: 't8',
                            },
                        },
                    },
                },
            },
        });

        obs.test.set('test2', 'hello2');
        obs.test.set('test3', 'hello3');
        obs.test4.test5.set('test6', 'hello6');
        obs.test7.set('test8', 'hello8');

        await onTrue(state, 'isLoadedRemote');
        await promiseTimeout();

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;
        await remote['promiseSaved'].promise;

        await promiseTimeout();

        expect(remote['remoteData']).toEqual({
            test: {
                testuid: {
                    s: {
                        t: {
                            t2: {
                                '@': '__serverTimestamp',
                                _: 'hello2',
                            },
                            t3: {
                                '@': '__serverTimestamp',
                                _: 'hello3',
                            },
                        },
                        t4: {
                            test5: {
                                t6: 'hello6',
                            },
                        },
                        t7: {
                            t8: 'hello8',
                        },
                    },
                },
            },
        });

        // TODO: Saving locally should be the non-transformed version
        expect(JSON.parse(global.localStorage.getItem('jestremote'))).toEqual({
            test: {
                '@': '__serverTimestamp',
                test2: 'hello2',
                test3: 'hello3',
            },
            test4: {
                test5: {
                    test6: 'hello6',
                },
            },
            test7: {
                test8: 'hello8',
            },
        });
    });
});

// TODO
// useObsProxy should batch listeners?

// # Persist
// Does setting a proxy to null delete it in firebase?
// Test fieldtranslator for more things
// Encryption

// # Things outside of Bravely scope
// Use MMKV for local?
// Functions inside proxy as actions should not be proxied and be bound to the proxy as this
// Promises
// useSyncExternalStore

// # More tests
// test read functions on array and map and stuff
// Need to document
