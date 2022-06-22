import { symbolSaveValue } from '../src/ObsPersistFirebaseBase';
import { obsProxy } from '../src';
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

        obsPersist(obs, {
            localPersistence: ObsPersistLocalStorage,
            remotePersistence: ObsPersistFirebaseJest,
            local: 'jestremote',
            remote: {
                requireAuth: true,
                firebase: {
                    // fieldTransforms: FieldMapTherapist,
                    syncPath: (uid) => `/test/${uid}/s`,
                    // spreadPaths: ['clientsList'],
                },
            },
        });

        const remote = mapPersistences.get(ObsPersistFirebaseJest) as ObsPersistFirebaseJest;
        const pending = remote['_pendingSaves2'];

        obs.test.test2 = 'hi';

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' } } });

        obs.test.test3 = 'hi2';

        expect(pending).toEqual({ test: { test2: { [symbolSaveValue]: 'hi' }, test3: { [symbolSaveValue]: 'hi2' } } });

        obs.test = { test2: 'test2 hi', test3: 'test3 hi' };

        expect(pending).toEqual({
            test: { [symbolSaveValue]: { test2: 'test2 hi', test3: 'test3 hi' } },
        });

        obs.test.test3 = 'test33333';

        expect(pending).toEqual({
            test: { [symbolSaveValue]: { test2: 'test2 hi', test3: 'test33333' } },
        });
    });
});
