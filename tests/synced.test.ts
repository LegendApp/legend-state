import { observable, observe } from '@legendapp/state';
import { synced } from '@legendapp/state/sync';
import { promiseTimeout } from './testglobals';

describe('unsubscribe', () => {
    test('Canceling observe unsubscribes', async () => {
        let numObserves = 0;
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const obs$ = observable(
            synced({
                get: () => 'foo',
                subscribe: () => {
                    numSubscribes++;

                    return () => {
                        numUnsubscribes++;
                    };
                },
            }),
        );

        const unsubscribe = observe(() => {
            numObserves++;
            obs$.get();
        });

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(0);

        unsubscribe();

        await promiseTimeout(0);

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        obs$.get();

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        observe(() => {
            numObserves++;
            obs$.get();
        });

        await promiseTimeout(0);

        expect(numObserves).toEqual(2);
        expect(numSubscribes).toEqual(2);
        expect(numUnsubscribes).toEqual(1);
    });
});
