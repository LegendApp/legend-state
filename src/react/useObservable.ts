import type { Observable } from '@legendapp/state';
import { computeSelector, observable, RecursiveValueOrFunction } from '@legendapp/state';
import { DependencyList, useRef } from 'react';

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
    deps?: DependencyList,
): Observable<T>;
export function useObservable<T>(value: T, deps?: DependencyList): Observable<T>;
export function useObservable<T>(value?: T, deps?: DependencyList): Observable<any>;
export function useObservable<T>(
    initialValue?: T | (() => T) | (() => Promise<T>),
    deps?: DependencyList,
): Observable<T> {
    // Create a ref to contain the observable and initialValue function
    const ref = useRef<{ obs$: Observable<T>; value: T }>({} as any);
    ref.current.value = initialValue as T;

    // Create a deps observable to be watched by the created observable
    const depsObs$ = deps ? useObservable(deps) : undefined;
    if (!ref.current?.obs$) {
        // Create the observable from the default value
        const value = depsObs$
            ? () => {
                  depsObs$.get();
                  return computeSelector(ref.current.value);
              }
            : initialValue;

        ref.current.obs$ = observable<T>(value as T);
    }
    // Update depsObs with the deps array
    if (depsObs$) {
        depsObs$.set(deps! as any[]);
    }

    return ref.current.obs$;
}
