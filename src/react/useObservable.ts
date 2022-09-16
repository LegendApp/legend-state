import { isFunction, observable, ObservablePrimitive, ObservableObjectOrArray } from '@legendapp/state';
import { useMemo } from 'react';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable(initialValue: boolean | (() => boolean)): ObservablePrimitive<boolean>;
export function useObservable(initialValue: string | (() => string)): ObservablePrimitive<string>;
export function useObservable(initialValue: number | (() => number)): ObservablePrimitive<number>;
export function useObservable<T>(initialValue: T | (() => T)): ObservableObjectOrArray<T>;
export function useObservable<T>(initialValue: T | (() => T)): ObservablePrimitive<T> | ObservableObjectOrArray<T> {
    // Create the observable from the default value
    return useMemo(() => observable(isFunction(initialValue) ? initialValue() : initialValue), []) as
        | ObservablePrimitive<T>
        | ObservableObjectOrArray<T>;
}
