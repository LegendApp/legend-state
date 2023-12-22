import { isFunction, observable, Observable } from '@legendapp/state';
import { useRef } from 'react';

/**
 * A React hook that creates a new observable
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable<T>(initialValue?: T | (() => T) | (() => Promise<T>)): Observable<T> {
    const ref = useRef<Observable<T>>();
    if (!ref.current) {
        // Create the observable from the default value
        ref.current = observable<T>((isFunction(initialValue) ? initialValue() : initialValue) as any);
    }
    return ref.current;
}
