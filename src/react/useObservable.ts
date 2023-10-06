import { Observable, isFunction, observable } from '@legendapp/state';
import { useMemo } from 'react';

/**
 * A React hook that creates a new observable
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable<T>(): Observable<T | undefined>;
export function useObservable<T>(initialValue: T | (() => T)): Observable<T>;
export function useObservable<T>(initialValue?: T | (() => T)): Observable<T | undefined> {
    // Create the observable from the default value
    return useMemo(() => observable(isFunction(initialValue) ? initialValue() : initialValue), []);
}
