import { observable } from '../src/observable';
import { syncState } from '../src/syncState';
import { synced } from '../sync';
import { promiseTimeout } from './testglobals';

describe('issue 334', () => {
    test('sync() resolves when the get fails on an unobserved observable', async () => {
        // repro #334
        let numGets = 0;
        const error = new Error('get failed');
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(5);
                    numGets++;
                    throw error;
                },
                onError: () => {},
            }),
        );

        const state$ = syncState(obs$);
        const settled = await Promise.race([state$.sync().then(() => true), promiseTimeout(50, false)]);

        expect(settled).toBe(true);
        expect(numGets).toEqual(1);
        expect(state$.error.peek()).toBe(error);
        expect(state$.isLoaded.peek()).toBe(false);
        expect(state$.isGetting.peek()).toBe(false);
    });
});
