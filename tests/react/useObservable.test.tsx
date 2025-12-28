import { act, render, renderHook } from '@testing-library/react';
import React, { createElement } from 'react';
import { observer } from '../../src/react/reactive-observer';
import { useObservable } from '../../src/react/useObservable';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { promiseTimeout } from '../testglobals';
import { synced } from '../../src/sync/synced';

if (typeof document === 'undefined') {
    GlobalRegistrator.register();
}

describe('useObservable', () => {
    test('creates observable with undefined when no initial value', () => {
        const { result } = renderHook(() => useObservable());

        expect(result.current.get()).toBeUndefined();

        act(() => {
            result.current.set(100);
        });

        expect(result.current.get()).toBe(100);

        act(() => {
            result.current.set(undefined as any);
        });

        expect(result.current.get()).toBeUndefined();
    });

    test('useObservable with changing deps array', async () => {
        let deps = [1, 2];
        let computeCount = 0;

        const { result, rerender } = renderHook(
            ({ deps }) => {
                const obs$ = useObservable(() => {
                    computeCount++;
                    return deps.reduce((a, b) => a + b, 0);
                }, deps);
                return obs$;
            },
            { initialProps: { deps } },
        );

        await act(async () => {
            // we listen
            result.current.get();
            await promiseTimeout(10);
        });

        expect(computeCount).toBe(1);
        expect(result.current.get()).toBe(3);

        // Change deps
        deps = [3, 4];
        rerender({ deps });

        await act(async () => {
            result.current.get();
            await promiseTimeout(10);
        });

        expect(computeCount).toBe(2);
        expect(result.current.get()).toBe(7);

        // Same deps, should not recompute
        rerender({ deps: [3, 4] });

        await act(async () => {
            result.current.get();
            await promiseTimeout(10);
        });

        expect(computeCount).toBe(2);
    });

    // test('synced useObservable with deps should be reseted when deps change', async () => {
    //     let numSubscribes = 0;
    //     let numUnsubscribes = 0;

    //     const Test = observer(function Test({ dep }: { dep: string }) {
    //         const obs$ = useObservable(
    //             synced({
    //                 initial: 0,
    //                 subscribe: () => {
    //                     console.log('subscribed ' + dep);
    //                     numSubscribes++;
    //                     return () => {
    //                         console.log('unsubscribed ' + dep);
    //                         numUnsubscribes++;
    //                     };
    //                 },
    //             }),
    //             [dep],
    //         );

    //         useEffect(() => {
    //             dep === 'initial' && obs$.set(2);
    //             console.log('effect ' + dep + ' ' + obs$.peek());
    //         }, [dep, obs$]);

    //         return createElement('div', undefined, obs$.get());
    //     });

    //     const { unmount, rerender } = render(<Test dep="initial" />);

    //     rerender(<Test dep="secondary" />);

    //     rerender(<Test dep="tertiary" />);

    //     act(() => {
    //         unmount();
    //     });

    //     // Wait for microtask to process listeners-cleared middleware event
    //     await act(async () => {
    //         await promiseTimeout(10);
    //     });

    //     expect(numSubscribes).toBe(3);
    //     expect(numUnsubscribes).toBe(3);
    // });

    test('useObservable with a synced should unsubscribe when unmounted', async () => {
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const Test = observer(function Test() {
            const obs$ = useObservable(
                synced({
                    initial: 0,
                    subscribe: () => {
                        numSubscribes++;
                        return () => {
                            numUnsubscribes++;
                            console.log('unsubscribed');
                        };
                    },
                }),
            );
            return createElement('div', undefined, obs$.get());
        });

        const { unmount } = render(<Test />);

        act(() => {
            unmount();
        });

        // Wait for microtask to process listeners-cleared middleware event
        await act(async () => {
            await promiseTimeout(10);
        });

        expect(numSubscribes).toBe(1);
        expect(numUnsubscribes).toBe(1);
    });
});
