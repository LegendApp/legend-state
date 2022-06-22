import { obsPersist } from '../src/ObsPersist';
import { ObsPersistLocalStorage } from '../src/web/ObsPersistLocalStorage';
import { listenToObs, obsProxy } from '../src';

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

describe('Persist', () => {
    test('Load local', () => {
        const obs = obsProxy({});

        obsPersist(obs, {
            local: 'jest',
            localPersistence: ObsPersistLocalStorage,
        });

        obs.set({ test: 'hello' });

        const localValue = global.localStorage.getItem('jest');

        // Should have saved to local storage
        expect(localValue).toBe(`{"test":"hello"}`);

        // obs2 should load with the same value it was just saved as
        const obs2 = obsProxy({});
        obsPersist(obs2, {
            local: 'jest',
            localPersistence: ObsPersistLocalStorage,
        });

        expect(obs2.value).toEqual({ test: 'hello' });
    });
});
