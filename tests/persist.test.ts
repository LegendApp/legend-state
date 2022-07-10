import { obsProxy } from '../src/ObsProxy';
import { getObsModified, onTrue } from '../src/ObsProxyFns';
import { PersistOptionsRemote, ProxyValue } from '../src/ObsProxyInterfaces';
import { configureObsProxy } from '../src/configureObsProxy';
import { symbolDateModified } from '../src/globals';
import { mapPersistences, obsPersist } from '../src/ObsPersist';
import { symbolSaveValue } from '../src/ObsPersistFirebaseBase';
import { ObsPersistLocalStorage } from '../src/web/ObsPersistLocalStorage';
import { ObsPersistFirebaseJest } from './ObsPersistFirebaseJest';
import { isArray, isObject, isString } from '@legendapp/tools';

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

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

export async function recursiveReplaceStrings<T extends string | object | number | boolean>(
    value: T,
    replacer: (val: string) => string
): Promise<T> {
    if (isArray(value)) {
        await Promise.all(
            value.map((v, i) =>
                recursiveReplaceStrings(v, replacer).then((val) => {
                    value[i] = val;
                })
            )
        );
    }
    if (isObject(value)) {
        await Promise.all(
            Object.keys(value).map((k) =>
                recursiveReplaceStrings(value[k], replacer).then((val) => {
                    value[k] = val;
                })
            )
        );
    }
    if (isString(value)) {
        value = await new Promise((resolve) => resolve(replacer(value as string) as T));
    }

    return value;
}

// @ts-ignore
global.localStorage = new LocalStorageMock();

configureObsProxy({
    persist: {
        localPersistence: ObsPersistLocalStorage,
        remotePersistence: ObsPersistFirebaseJest,
        saveTimeout: 16,
    },
});

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
        });

        obs.set({ test: 'hello' });

        const localValue = global.localStorage.getItem('jestlocal');

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        // obs2 should load with the same value it was just saved as
        const obs2 = obsProxy({});
        obsPersist(obs2, {
            local: 'jestlocal',
        });

        expect(obs2.get()).toEqual({ test: 'hello' });
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
        });

        expect(obs.get()).toEqual({
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
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.test2.set('hi');

        await promiseTimeout();

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('testuid')).saves;

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': 'hi',
        });

        obs.test.test3.set('hi2');

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

        obs.test.test3.set('test33333');

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
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.test2.set('hi');

        await promiseTimeout();

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('testuid')).saves;

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.test3.set('hi2');

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

    test('Pending after save with different dateModifiedKey', async () => {
        const obs = obsProxy({ test: { test2: 'hello', test3: 'hello2' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: true,
            },
        };

        obsPersist(obs, {
            local: 'jestremote',
            remote: remoteOptions,
            dateModifiedKey: 'd',
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set({ test2: 'hi', test3: 'hi2' });

        await promiseTimeout();

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('testuid')).saves;

        expect(pending).toEqual({ test: { [symbolSaveValue]: { test2: 'hi', test3: 'hi2' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test': {
                d: '__serverTimestamp',
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
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.test2.set('hi');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
        });

        obs.test.test3.set('hi2');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
        });

        obs.test.test4.test5.set('hi3');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/@': '__serverTimestamp',
            '/test/testuid/s/test/test2': 'hi',
            '/test/testuid/s/test/test3': 'hi2',
            '/test/testuid/s/test/test4/test5': 'hi3',
        });

        obs.test.test4.test6.test7.set('hi4');

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
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.test2.set('hi');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.test3.set('hi2');

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

        obs.test.test4.test5.set('hi3');

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

        obs.test.test4.test6.test7.set('hi4');

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

    test('save queryByModified 2', async () => {
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
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.test2.set('hi');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test2': {
                '@': '__serverTimestamp',
                _: 'hi',
            },
        });

        obs.test.test4.test6.test7.set('hi4');

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
                test4: {
                    '@': '__serverTimestamp',
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
                queryByModified: { test: { '*': '*' } },
            },
        };

        obsPersist(obs, {
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
                            __dict: {
                                text: 't2',
                            },
                        },
                    },
                },
            },
        };

        obsPersist(obs, {
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
                    t2: 'hi',
                },
                container2: {
                    t2: 'hi2',
                },
            },
            '/test/testuid/s/t/test1/@': '__serverTimestamp',
            '/test/testuid/s/t/test2': {
                container3: {
                    t2: 'hi3',
                },
                container4: {
                    t2: 'hi4',
                },
            },
            '/test/testuid/s/t/test2/@': '__serverTimestamp',
        });

        await remote['promiseSaved'].promise;
    });

    test('save queryByModified with dict and field transforms */*', async () => {
        const obs = obsProxy<{ test: Record<string, Record<string, { text: string }>> }>({
            test: {},
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: { test: { '*': '*' } },
                fieldTransforms: {
                    test: {
                        _: 't',
                        __dict: {
                            __dict: {
                                text: 't2',
                            },
                        },
                    },
                },
            },
        };

        obsPersist(obs, {
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
                    t2: 'hi',
                },
                container2: {
                    '@': '__serverTimestamp',
                    t2: 'hi2',
                },
            },
            '/test/testuid/s/t/test2': {
                container3: {
                    '@': '__serverTimestamp',
                    t2: 'hi3',
                },
                container4: {
                    '@': '__serverTimestamp',
                    t2: 'hi4',
                },
            },
        });

        await remote['promiseSaved'].promise;
    });

    test('save queryByModified with complex dict', async () => {
        const obs = obsProxy<{
            test: Record<string, { test2: { test3: string }; test4: Record<string, { text: string }>; test5: string }>;
        }>({
            test: {},
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    test: {
                        '*': {
                            '*': true,
                            test4: '*',
                        },
                    },
                },
            },
        };

        obsPersist(obs, {
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test1', {
            test2: {
                test3: 'hi3',
            },
            test4: {
                container1: {
                    text: 'hi1',
                },
            },
            test5: 'hi5',
        });

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/test/test1': {
                test2: {
                    '@': '__serverTimestamp',
                    test3: 'hi3',
                },
                test4: {
                    container1: {
                        '@': '__serverTimestamp',
                        text: 'hi1',
                    },
                },
                test5: {
                    '@': '__serverTimestamp',
                    _: 'hi5',
                },
            },
        });

        await remote['promiseSaved'].promise;
    });

    test('save queryByModified with complex dict transformed', async () => {
        const obs = obsProxy<{
            test: Record<string, { test2: { test3: string }; test4: Record<string, { text: string }> }>;
        }>({
            test: {},
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    test: {
                        '*': {
                            test2: true,
                            test4: '*',
                        },
                    },
                },
                fieldTransforms: {
                    test: {
                        _: 't',
                        __dict: {
                            test2: {
                                _: 't2',
                                __obj: {
                                    test3: 't3',
                                },
                            },
                            test4: {
                                _: 't4',
                                __dict: {
                                    text: 'tt',
                                },
                            },
                        },
                    },
                },
            },
        };

        obsPersist(obs, {
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set('test1', {
            test2: {
                test3: 'hi3',
            },
            test4: {
                container1: {
                    text: 'hi1',
                },
            },
        });

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/t/test1': {
                t2: {
                    '@': '__serverTimestamp',
                    t3: 'hi3',
                },
                t4: {
                    container1: {
                        '@': '__serverTimestamp',
                        tt: 'hi1',
                    },
                },
            },
        });

        await remote['promiseSaved'].promise;
    });

    test('Save a deep property', async () => {
        const obs = obsProxy({
            clients: { clientID: { profile: { name: '' }, outer: { inner: { id1: { text: '' }, id2: '' } } } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    clients: {
                        '*': {
                            '*': true,
                            outer: {
                                inner: '*',
                            },
                        },
                    },
                },
            },
        };
        initializeRemote({
            clients: {
                clientID: {
                    profile: {
                        '@': 1000,
                        name: 'hi name',
                    },
                    outer: {
                        inner: {
                            id1: {
                                '@': 1000,
                                text: 'hi1',
                            },
                            id2: {
                                '@': 1000,
                                _: 'hi1',
                            },
                        },
                    },
                },
            },
        });

        const state = obsPersist(obs, {
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.clients.clientID.outer.inner.id1.text.set('hi111');

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/clients/clientID/outer/inner/id1/@': '__serverTimestamp',
            '/test/testuid/s/clients/clientID/outer/inner/id1/text': 'hi111',
        });

        await remote['promiseSaved'].promise;
    });

    test('Set a deep property to null', async () => {
        const obs = obsProxy({
            clients: { clientID: { profile: { name: '' }, outer: { inner: { id1: { text: '' }, id2: '' } } } },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    clients: {
                        '*': {
                            '*': true,
                            outer: {
                                inner: '*',
                            },
                        },
                    },
                },
            },
        };
        initializeRemote({
            clients: {
                clientID: {
                    profile: {
                        '@': 1000,
                        name: 'hi name',
                    },
                    outer: {
                        inner: {
                            id1: {
                                '@': 1000,
                                text: 'hi1',
                            },
                            id2: {
                                '@': 1000,
                                _: 'hi1',
                            },
                        },
                    },
                },
            },
        });

        const state = obsPersist(obs, {
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.clients.clientID.outer.inner.id1.set(null);

        await promiseTimeout();

        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/clients/clientID/outer/inner/id1': {
                '@': '__serverTimestamp',
            },
        });

        await remote['promiseSaved'].promise;
    });
    test('ignoreKeys', async () => {
        const obs = obsProxy({ test: { id: 'id0', text: 'text0' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                ignoreKeys: { id: true },
                fieldTransforms: {
                    test: {
                        _: 't',
                        __obj: {
                            text: 't2',
                        },
                    },
                },
            },
        };

        const state = obsPersist(obs, {
            local: 'jestremote',
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.set({ id: 'id1', text: 'text1' });

        await promiseTimeout();

        const pending = remote['_pendingSaves2'].get(remoteOptions.firebase.syncPath('testuid')).saves;

        expect(pending).toEqual({ t: { [symbolSaveValue]: { t2: 'text1' } } });
        expect(remote['_constructBatchForSave']()).toEqual({
            '/test/testuid/s/t': { t2: 'text1' },
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
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

    test('Persist remote load with nested timestamps', async () => {
        const obs = obsProxy({
            clients: {
                clientID: {
                    profile: { name: '' },
                    outer: {
                        inner: {
                            id1: { text: '' },
                            id2: '',
                        },
                    },
                },
            },
        });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
                queryByModified: {
                    clients: {
                        '*': true,
                        outer: {
                            inner: '*',
                        },
                    },
                },
            },
        };

        initializeRemote({
            clients: {
                clientID: {
                    profile: {
                        '@': 1000,
                        name: 'hi name',
                    },
                    basic: {
                        '@': 1001,
                        _: 'basictext',
                    },
                    outer: {
                        inner: {
                            id1: {
                                '@': 1000,
                                text: 'hi1',
                            },
                            id2: {
                                '@': 1000,
                                _: 'hi1',
                            },
                        },
                    },
                },
            },
        });

        const state = obsPersist(obs, {
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
            clients: {
                clientID: {
                    [symbolDateModified]: 1001,
                    profile: {
                        [symbolDateModified]: 1000,
                        name: 'hi name',
                    },
                    basic: 'basictext',
                    outer: {
                        inner: {
                            id1: {
                                [symbolDateModified]: 1000,
                                text: 'hi1',
                            },
                            id2: 'hi1',
                            [symbolDateModified]: 1000,
                        },
                    },
                },
            },
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        modifyRemote('test', { '@': 1001, test2: 'hello2' });

        await promiseTimeout();

        expect(obs.test.get()).toEqual({
            test2: 'hello2',
            test3: 'hi3',
            [symbolDateModified]: 1001,
        });

        expect(obs.test.test2.get()).toEqual('hello2');
        expect(obs.test.test3.get()).toEqual('hi3');
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
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        modifyRemote('test/test2', { '@': 1001, test22: 'hello2' });

        await promiseTimeout();

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

        expect(obs.test.test2.test22.get()).toEqual('hello2');
        expect(obs.test.test3.test33.get()).toEqual('hi3');

        expect(obs.test.test2.get()['@']).toEqual(undefined);
        expect(obs.test.test3.get()['@']).toEqual(undefined);
        expect(obs.test.get()['@']).toEqual(undefined);

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

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
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

        await onTrue(state.isLoadedRemote);
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
                                '@': '__serverTimestamp',
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
                    '@': '__serverTimestamp',
                    test6: 'hello6',
                },
            },
            test7: {
                test8: 'hello8',
            },
        });
    });
});

describe('Adjust data', () => {
    test('adjust save data', async () => {
        const obs = obsProxy({ test: { test2: 'hello' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            adjustData: {
                load: async (value, path) => {
                    return recursiveReplaceStrings(value, (val) => val.replace('_adjusted', ''));
                },
                save: async (value, basePath, path) => {
                    return recursiveReplaceStrings(value, (val) => val + '_adjusted');
                },
            },
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
            },
        };

        obsPersist(obs, {
            local: 'jestremote',
            remote: remoteOptions,
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;

        obs.test.test2.set('hi');

        await promiseTimeout();

        await remote['promiseSaved'].promise;

        expect(remote['remoteData']).toEqual({
            test: {
                testuid: {
                    s: {
                        test: {
                            test2: 'hi_adjusted',
                        },
                    },
                },
            },
        });
    });

    test('adjust incoming data', async () => {
        const obs = obsProxy({ test: { test2: 'hello' } });

        const remoteOptions: PersistOptionsRemote = {
            requireAuth: true,
            adjustData: {
                load: async (value, path) => {
                    return recursiveReplaceStrings(value, (val) => val.replace('_adjusted', ''));
                },
                save: async (value, basePath, path) => {
                    return recursiveReplaceStrings(value, (val) => val + '_adjusted');
                },
            },
            firebase: {
                syncPath: (uid) => `/test/${uid}/s/`,
            },
        };

        obsPersist(obs, {
            local: 'jestremote',
            remote: remoteOptions,
        });

        initializeRemote({
            test: {
                test2: 'hi_adjusted',
            },
        });

        const state = obsPersist(obs, {
            remote: remoteOptions,
        });

        await onTrue(state.isLoadedRemote);

        expect(obs.get()).toEqual({
            test: {
                test2: 'hi',
            },
        });
    });
});

// TODO
// Do string functions work on primitives?

// # Persist
// Test that null or undefined in local does not overwrite defaults, maybe don't allow saving null or undefined at all?

// # Things outside of Bravely scopea
// Handle setting with another proxy, goes into infinite recursion? Should call get on it?
// Functions inside proxy as actions should not be proxied and be bound to the proxy as this
// Promises
// useSyncExternalStore
// How to use it as a trigger by just notifying

// # More tests
// test read functions on array and map and stuff
// Need to document
// Promises return from on functions

// # To document
// Values coming in as null from remote is not really supported
