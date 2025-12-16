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

    test('Canceling observe unsubscribes observing child node', async () => {
        let numObserves = 0;
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const obs$ = observable(
            synced({
                get: () => ({ foo: 'bar' }),
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
            obs$.foo.get();
        });

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(0);

        unsubscribe();

        await promiseTimeout(0);

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        obs$.foo.get();

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        observe(() => {
            numObserves++;
            obs$.foo.get();
        });

        await promiseTimeout(0);

        expect(numObserves).toEqual(2);
        expect(numUnsubscribes).toEqual(1);
        expect(numSubscribes).toEqual(2);
    });
});

describe('synced', () => {
    test('observing synced linked observable', () => {
        const obs$ = observable({
            count: synced({
                initial: 0,
            }),
            total: (): number => {
                return obs$.count as any;
            },
        });

        let total = 0;
        observe(() => {
            total = obs$.total.get();
        });

        expect(total).toEqual(0);

        obs$.count.set(1);

        expect(total).toEqual(1);
    });

    test('observing synced array length', () => {
        const obs$ = observable({
            arr: synced({
                initial: [
                    { id: 1, text: 'a' },
                    { id: 2, text: 'b' },
                    { id: 3, text: 'c' },
                ],
            }),
            total: (): number => {
                return obs$.arr.length;
            },
        });

        let total = 0;
        observe(() => {
            total = obs$.total.get();
        });

        expect(total).toEqual(3);

        obs$.arr.push({ id: 4, text: 'd' });

        expect(total).toEqual(4);
    });
    test('observing synced array length 2', () => {
        const obs$ = observable({
            arr: synced({
                initial: [
                    { id: 1, text: 'a' },
                    { id: 2, text: 'b' },
                    { id: 3, text: 'c' },
                ],
            }),
            total: () => {
                return obs$.arr;
            },
        });

        let total = 0;
        observe(() => {
            total = obs$.total.length;
        });

        expect(total).toEqual(3);

        obs$.arr.push({ id: 4, text: 'd' });

        expect(total).toEqual(4);
    });
    test('no exponential get calls', () => {
        const page$ = observable(0);
        let getCalls = 0;
        const state$ = observable(
            synced({
                initial: 'noo',
                get: () => {
                    page$.get();
                    getCalls++;
                    return 'foo';
                },
            }),
        );
        observe(() => {
            state$.get();
        });
        page$.set((p) => p + 1);
        page$.set((p) => p + 1);
        page$.set((p) => p + 1);
        expect(getCalls).toEqual(4);
    });
});
