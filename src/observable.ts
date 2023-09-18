import { extractPromise, getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { isActualPrimitive, isPromise } from './is';
import type { Observable, ObservablePrimitive, ObservableRoot, PromiseInfo } from './observableInterfaces';
import { NodeValue } from './observableInterfaces';

type MaybePromise<T> = NonNullable<T> extends Promise<infer U> ? (U & PromiseInfo) | Extract<T, undefined> : T;

function createObservable<T>(value: T, makePrimitive: true): ObservablePrimitive<MaybePromise<T>>;
function createObservable<T>(value: T, makePrimitive: false): Observable<MaybePromise<T>>;
function createObservable<T>(value: T, makePrimitive: boolean): Observable<T> | ObservablePrimitive<T> {
    const valueIsPromise = isPromise<T>(value);
    const root: ObservableRoot = {
        _: value,
    };

    const node: NodeValue = {
        root,
        lazy: true,
    };

    const prim = makePrimitive || isActualPrimitive(value);

    const obs = prim
        ? (new (ObservablePrimitiveClass as any)(node) as Observable<T>)
        : (getProxy(node) as Observable<T>);

    if (valueIsPromise) {
        extractPromise(node, value);
    }

    return obs;
}

export type MaybePromiseObservable<T> = Observable<MaybePromise<T>>;

export function observable<T>(): MaybePromiseObservable<T | undefined>;
export function observable<T>(value: T): MaybePromiseObservable<T>;
export function observable<T>(value?: T): MaybePromiseObservable<T | undefined> {
    return createObservable(value, /*makePrimitive*/ false);
}

export function observablePrimitive<T>(): ObservablePrimitive<MaybePromise<T | undefined>>;
export function observablePrimitive<T>(value: T): ObservablePrimitive<MaybePromise<T>>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<MaybePromise<T | undefined>> {
    return createObservable(value, /*makePrimitive*/ true);
}
