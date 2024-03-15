import { observable, Observable, RecursiveValueOrFunction } from '@legendapp/state';
import { useRef } from 'react';

/**
 * A React hook that creates a new observable
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable<T>(): Observable<T | undefined>;
export function useObservable<T>(
    value: Promise<RecursiveValueOrFunction<T>> | (() => RecursiveValueOrFunction<T>) | RecursiveValueOrFunction<T>,
): Observable<T>;
export function useObservable<T>(value: T): Observable<T>;
export function useObservable<T>(value?: T): Observable<any>;
export function useObservable<T>(initialValue?: T | (() => T) | (() => Promise<T>)): Observable<T> {
    const ref = useRef<Observable<T>>();
    if (!ref.current) {
        // Create the observable from the default value
        ref.current = observable<T>(initialValue as any);
    }
    return ref.current;
}
