import { computed } from './computed';
import { createObservable } from './createObservable';
import { isFunction } from './is';
import type {
    Observable,
    ObservableComputed,
    ObservableComputedTwoWay,
    ObservablePrimitive,
    ObservableReadable,
} from './observableInterfaces';

export function observable<T>(value?: T | Promise<T>): Observable<T>;
export function observable<T extends ObservableReadable>(compute: () => T | Promise<T>): T;
export function observable<T>(compute: () => T | Promise<T>): ObservableComputed<T>;
export function observable<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set: (value: T2) => void
): ObservableComputedTwoWay<T, T2>;
export function observable<T, T2>(
    value?: T | Promise<T> | (() => T),
    set?: (value: T2) => void
): Observable<T> | ObservableComputed<T> {
    return isFunction(value) ? computed(value, set) : (createObservable(value) as Observable<T>);
}

export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T> {
    return createObservable<T>(value, /*makePrimitive*/ true);
}
