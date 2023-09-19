import { isFunction, observable } from '@legendapp/state';
import { useMemo } from 'react';
import type { MaybePromiseObservable } from '../observable';

/**
 * A React hook that creates a new observable
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function useObservable<T>(): MaybePromiseObservable<T | undefined>;
export function useObservable<T>(initialValue: T | (() => T)): MaybePromiseObservable<T>;
export function useObservable<T>(initialValue?: T | (() => T)): MaybePromiseObservable<T | undefined> {
    // Create the observable from the default value
    return useMemo(() => observable(isFunction(initialValue) ? initialValue() : initialValue), []);
}
