import { observable } from '../src/observable';
import { persistObservable } from '../src/persist/persistObservable';
import { when } from '../src/when';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

jest.setTimeout(50);

describe('Persist remote with functions', () => {
    test('Persist remote fns basic', async () => {
        const obs = observable({ test: { x: 'hi' } });
        const state = persistObservable(obs, {
            persistRemote: {
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

        await when(state.isLoadedRemote);

        expect(obs.peek()).toEqual({ test: { x: 'hello' } });
    });
    test('Persist remote fns with set', async () => {
        let setTo: { dateModified: number; value: any } | undefined = undefined;
        const obs$ = observable({ test: { x: 'hi' } });
        const state = persistObservable(obs$, {
            persistRemote: {
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
                            setTo = { dateModified: now, value };
                            resolve({ dateModified: now });
                        }, 0);
                    });
                },
            },
        });

        expect(obs$.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoadedRemote);

        expect(obs$.peek()).toEqual({ test: { x: 'hello' } });

        obs$.test.x.set('hi2');

        await promiseTimeout(10);

        expect(setTo).toEqual({ dateModified: expect.any(Number), value: { test: { x: 'hi2' } } });
    });
    test('Persist remote fns with set and onSaveRemote', async () => {
        let setTo: { dateModified: number; value: any } | undefined = undefined;
        const obs$ = observable({ test: { x: 'hi' } });
        const didSave$ = observable(false);
        const state = persistObservable(obs$, {
            persistRemote: {
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
                            setTo = { dateModified: now, value };
                            resolve({ dateModified: now });
                        }, 10);
                    });
                },
            },
            remote: {
                onSaveRemote() {
                    didSave$.set(true);
                },
            },
        });

        expect(obs$.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoadedRemote);

        expect(obs$.peek()).toEqual({ test: { x: 'hello' } });

        obs$.test.x.set('hi2');

        await when(didSave$);

        expect(setTo).toEqual({ dateModified: expect.any(Number), value: { test: { x: 'hi2' } } });
    });
    // TODO test dateModified
});
