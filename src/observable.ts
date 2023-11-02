import { globalState } from './globals';
import { extractPromise, getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { createObservable } from './createObservable';
import type { WithState } from './observableInterfaces';
import type { Observable, ObservablePrimitive } from './observableTypes';

// Allow input types to have functions in them
type ValueOrFunction<T> = T extends Function ? T : T | (() => T | Promise<T>);
type ValueOrFunctionKeys<T> = {
    [K in keyof T]: RecursiveValueOrFunction<T[K]>;
};

type RecursiveValueOrFunction<T> = T extends Function
    ? T
    : T extends object
    ?
          | (() => T | Promise<T>)
          | Promise<ValueOrFunctionKeys<T>>
          | ValueOrFunctionKeys<T>
          | (() => ValueOrFunctionKeys<T> | Promise<ValueOrFunctionKeys<T>>)
    : ValueOrFunction<T>;

export function observable<T>(): Observable<T | undefined>;
export function observable<T>(value: RecursiveValueOrFunction<T | Promise<T>>): Observable<T>;
export function observable<T>(value?: T): any {
    return createObservable(value, false, extractPromise, getProxy, ObservablePrimitiveClass) as any;
}

export function observablePrimitive<T>(value: Promise<T>): ObservablePrimitive<T & WithState>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T & WithState> {
    return createObservable(value, true, extractPromise, getProxy, ObservablePrimitiveClass) as ObservablePrimitive<
        T & WithState
    >;
}

globalState.isLoadingRemote$ = observable(false);
