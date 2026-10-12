import { extractPromise, getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { createObservable } from './createObservable';
import type { ObservableOptions } from './observableInterfaces';
import type { Observable, ObservablePrimitive, RecursiveValueOrFunction } from './observableTypes';

export function observable<T>(): Observable<T | undefined>;
export function observable<T>(
    value: Promise<RecursiveValueOrFunction<T>> | (() => RecursiveValueOrFunction<T>) | RecursiveValueOrFunction<T>,
    options?: ObservableOptions,
): Observable<T>;
export function observable<T>(value: T, options?: ObservableOptions): Observable<T>;
export function observable<T>(value?: T, options?: ObservableOptions): Observable<any> {
    return createObservable(value, false, extractPromise, getProxy, ObservablePrimitiveClass, options) as any;
}

export function observablePrimitive<T>(value: Promise<T>, options?: ObservableOptions): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T, options?: ObservableOptions): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T | Promise<T>, options?: ObservableOptions): ObservablePrimitive<T> {
    return createObservable(value, true, extractPromise, getProxy, ObservablePrimitiveClass, options) as any;
}
