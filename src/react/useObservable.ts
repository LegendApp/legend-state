import type { Observable } from '@legendapp/state';
import { computeSelector, getNode, internal, isFunction, observable, RecursiveValueOrFunction } from '@legendapp/state';
import { DependencyList, useRef } from 'react';
import { useUnmount } from './useUnmount';

const { deactivateNode } = internal;

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
        // Create the observable from the default value. If the selector function is a lookup table
        // then it needs to be a function taking a string to pass it through.
        const value = depsObs$
            ? isFunction(initialValue) && initialValue.length === 1
                ? (p: string) => {
                      depsObs$.get();
                      return (ref.current.value as (p: string) => any)(p);
                  }
                : () => {
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

    useUnmount(() => {
        // Make sure that any observables this is tracking are deactivated on unmount
        // TODO: It's possible that this might need to deactivate all child observables in the tree
        // but we would want to have a way of saving the dispose functions at the root so we
        // don't have to do it recursively.
        const obs = ref.current.obs$;
        if (obs) {
            const node = getNode(obs as Observable<any>);
            deactivateNode(node);
        }
    });

    return ref.current.obs$;
}
