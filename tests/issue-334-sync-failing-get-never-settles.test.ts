import { observable } from '../src/observable';
import { syncState } from '../src/syncState';
import { synced } from '../sync';
import { promiseTimeout } from './testglobals';

describe('issue 334', () => {
    test.failing('sync() resolves when the get fails on an unobserved observable', 1000, async () => {
        // repro #334
        let numGets = 0;
        const obs$ = observable(
            synced({
                get: async () => {
                    await promiseTimeout(5);
                    numGets++;
                    throw new Error('get failed');
                },
                onError: () => {},
            }),
        );

        const settled = await Promise.race([
            syncState(obs$)
                .sync()
                .then(() => true),
            promiseTimeout(50, false),
        ]);

        expect(numGets).toEqual(1);
        expect(settled).toBe(true);
    });
});
