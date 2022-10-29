import { isFunction, observable, Observable, PersistOptions } from '@legendapp/state';
import { persistObservable } from '@legendapp/state/persist';
import { useMemo } from 'react';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable<T>(
    initialValue?: T | (() => T) | (() => Promise<T>),
    options?: { persist: PersistOptions<T> }
): Observable<T> {
    // Create the observable from the default value
    return useMemo(() => {
        const obs = observable<T>(
            isFunction(initialValue as () => T) ? (initialValue as () => T)() : (initialValue as T)
        );
        if (options) {
            if (options.persist) {
                persistObservable<T>(obs as Observable<T>, options.persist);
            }
        }
        return obs;
    }, []) as any;
}
