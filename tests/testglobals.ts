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
    // @ts-expect-error This is ok to do in jest
    global.localStorage = new LocalStorageMock();
}
