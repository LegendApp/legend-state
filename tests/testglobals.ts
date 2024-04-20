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
