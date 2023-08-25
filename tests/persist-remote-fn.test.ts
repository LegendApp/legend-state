import { observable } from '../src/observable';
import { persistObservable } from '../src/persist/persistObservable';
import { when } from '../src/when';

describe('Persist remote with functions', () => {
    test('Perist remote fns basic', async () => {
        const obs = observable({ test: { x: 'hi' } });
        const state = persistObservable(obs, {
            persistRemote: {
                async get({ dateModified }) {
                    return { test: { x: 'hello' } };
                },
                async set({ value }) {
                    return { dateModified: Date.now() };
                },
            },
        });

        expect(obs.peek()).toEqual({ test: { x: 'hi' } });

        await when(state.isLoadedRemote);

        expect(obs.peek()).toEqual({ test: { x: 'hello' } });
    });
});
