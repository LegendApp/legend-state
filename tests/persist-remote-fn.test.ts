import { configureObservablePersistence } from '../src/persist/configureObservablePersistence';
import { observable } from '../src/observable';
import { persistObservable } from '../src/persist/persistObservable';
import { when } from '../src/when';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

jest.setTimeout(50);
beforeEach(() => {
    configureObservablePersistence({ remoteOptions: undefined });
});

describe('Persist remote with functions', () => {
    test('Persist remote fns basic', async () => {
        const obs = observable({ test: { x: 'hi' } });
        const state = persistObservable(obs, {
            pluginRemote: {
                async get() {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ test: { x: 'hello' } });
                        }, 10);
                    });
                },
            },
        });

        expect(obs.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoaded);

        expect(obs.peek()).toEqual({ test: { x: 'hello' } });
    });
    test('Persist remote fns with set', async () => {
        let setTo: { lastSync: number; value: any } | undefined = undefined;
        const obs$ = observable({ test: { x: 'hi' } });
        const state = persistObservable(obs$, {
            pluginRemote: {
                async get() {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ test: { x: 'hello' } });
                        }, 0);
                    });
                },
                async set({ value }) {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            const now = Date.now();
                            setTo = { lastSync: now, value };
                            resolve({ lastSync: now });
                        }, 0);
                    });
                },
            },
        });

        expect(obs$.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoaded);

        expect(obs$.peek()).toEqual({ test: { x: 'hello' } });

        obs$.test.x.set('hi2');

        await promiseTimeout(10);

        expect(setTo).toEqual({ lastSync: expect.any(Number), value: { test: { x: 'hi2' } } });
    });
    test('Persist remote fns with set and onSaveRemote', async () => {
        let setTo: { lastSync: number; value: any } | undefined = undefined;
        const obs$ = observable({ test: { x: 'hi' } });
        const didSave$ = observable(false);
        const state = persistObservable(obs$, {
            pluginRemote: {
                async get() {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ test: { x: 'hello' } });
                        }, 10);
                    });
                },
                async set({ value }) {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            const now = Date.now();
                            setTo = { lastSync: now, value };
                            resolve({ lastSync: now });
                        }, 10);
                    });
                },
            },
            remote: {
                onAfterSet() {
                    didSave$.set(true);
                },
            },
        });

        expect(obs$.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoaded);

        expect(obs$.peek()).toEqual({ test: { x: 'hello' } });

        obs$.test.x.set('hi2');

        await when(didSave$);

        expect(setTo).toEqual({ lastSync: expect.any(Number), value: { test: { x: 'hi2' } } });
    });
    test('Persist remote fns with set and a timeout', async () => {
        let setTo: { lastSync: number; value: any } | undefined = undefined;
        const didSet$ = observable(false);

        configureObservablePersistence({ remoteOptions: { debounceSet: 10 } });

        const obs$ = observable({ test: { x: 'hi' } });
        const state = persistObservable(obs$, {
            pluginRemote: {
                async get() {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ test: { x: 'hello' } });
                        }, 0);
                    });
                },
                async set({ value }) {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            const now = Date.now();
                            setTo = { lastSync: now, value };
                            resolve({ lastSync: now });
                            didSet$.set(true);
                        }, 0);
                    });
                },
            },
        });

        expect(obs$.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoaded);

        expect(obs$.peek()).toEqual({ test: { x: 'hello' } });

        obs$.test.x.set('hi2');

        await when(didSet$);

        expect(setTo).toEqual({ lastSync: expect.any(Number), value: { test: { x: 'hi2' } } });
    });
    test('Persist remote fns with set and a timeout saves only once', async () => {
        let setTo: { lastSync: number; value: any } | undefined = undefined;
        const didSet$ = observable(false);
        let numSets = 0;

        configureObservablePersistence({ remoteOptions: { debounceSet: 10 } });

        const obs$ = observable({ test: { x: 'hi' } });
        const state = persistObservable(obs$, {
            pluginRemote: {
                async get() {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ test: { x: 'hello' } });
                        }, 0);
                    });
                },
                async set({ value }) {
                    // Emulate a network request with a timeout
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            numSets++;
                            const now = Date.now();
                            setTo = { lastSync: now, value };
                            resolve({ lastSync: now });
                            didSet$.set(true);
                        }, 0);
                    });
                },
            },
        });

        expect(obs$.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoaded);

        expect(obs$.peek()).toEqual({ test: { x: 'hello' } });

        obs$.test.x.set('hi2');
        setTimeout(() => {
            obs$.test.x.set('hi3');
            setTimeout(() => {
                obs$.test.x.set('hi4');
            }, 0);
        }, 0);

        await when(didSet$);

        expect(numSets).toEqual(1);
        expect(setTo).toEqual({ lastSync: expect.any(Number), value: { test: { x: 'hi4' } } });
    });
    // TODO test lastSync
});
