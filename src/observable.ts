import { createObservable } from './createObservable';
import { getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import type { Observable, ObservablePrimitive, WithState } from './observableInterfaces';

export function observable<T>(value: Promise<T>): Observable<T & WithState>;
export function observable<T>(value?: T): Observable<T>;
export function observable<T>(value?: T | Promise<T>): Observable<T & WithState> {
    return createObservable(value, false, getProxy, ObservablePrimitiveClass) as Observable<T & WithState>;
}

export function observablePrimitive<T>(value: Promise<T>): ObservablePrimitive<T & WithState>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T & WithState> {
    return createObservable(value, true, getProxy, ObservablePrimitiveClass) as ObservablePrimitive<T & WithState>;
}
