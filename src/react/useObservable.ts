import { isFunction, observable, Observable } from '@legendapp/state';
import { useMemo } from 'react';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable<T>(initialValue?: T | (() => T)): Observable<T> {
    // Create the observable from the default value
    return useMemo(
        () => observable(isFunction(initialValue as () => T) ? (initialValue as () => T)() : (initialValue as T)),
        []
    ) as any;
}
