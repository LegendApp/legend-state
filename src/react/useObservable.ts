import { isFunction, observable } from '@legendapp/state';
import { useMemo } from 'react';
import type { ObservableObjectOrPrimitive } from '../observableInterfaces';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable<T>(initialValue: T | (() => T)): ObservableObjectOrPrimitive<T> {
    // Create the observable from the default value
    return useMemo(
        () => observable<any>(isFunction(initialValue) ? initialValue() : initialValue),
        []
    ) as ObservableObjectOrPrimitive<T>; // eslint-disable-line react-hooks/exhaustive-deps
}
