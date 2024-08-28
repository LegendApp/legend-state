import { jest } from '@jest/globals';
import { ObservablePersistLocalStorageBase } from '../src/persist-plugins/local-storage';
import type { Change, TrackingType } from '../src/observableInterfaces';
import type { Observable } from '../src/observableTypes';

export interface BasicValue {
    id: string;
    test: string;
    createdAt?: string | number | null;
    updatedAt?: string | number | null;
    parent?: {
        child: {
            baby: string;
        };
    };
}
export interface BasicValue2 {
    id: string;
    test2: string;
    updatedAt?: string | number | null;
}

export function mockLocalStorage() {
    class LocalStorageMock {
        store: Record<any, any>;
        constructor() {
            this.store = {};
        }
        clear() {
            this.store = {};
        }
        getItem(key: string) {
            return this.store[key] || null;
        }
        setItem(key: string, value: any) {
            this.store[key] = String(value);
        }
        removeItem(key: string) {
            delete this.store[key];
        }
    }
    return new LocalStorageMock() as unknown as Storage;
}

export function promiseTimeout<T>(time?: number, value?: T) {
    return new Promise<T>((resolve) => setTimeout(() => resolve(value!), time || 0));
}

let localNum = 0;
export const getPersistName = () => 'jestlocal' + localNum++;

export function expectChangeHandler(value$: Observable, track?: TrackingType) {
    const ret = jest.fn();

    function handler({ value, getPrevious, changes }: { value: any; getPrevious: () => any; changes: Change[] }) {
        const prev = getPrevious();

        ret(value, prev, changes);
    }

    value$.onChange(handler, { trackingType: track });

    return ret;
}

export const localStorage = mockLocalStorage();
export class ObservablePersistLocalStorage extends ObservablePersistLocalStorageBase {
    constructor() {
        super(localStorage);
    }
}

export function supressActWarning(fn: () => void) {
    const originalError = console.error;
    console.error = (...args) => {
        if (/act/.test(args[0])) {
            return;
        }
        originalError.call(console, ...args);
    };

    fn();

    console.error = originalError;
}
