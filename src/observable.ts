import { extractPromise, getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { isActualPrimitive, isPromise } from './is';
import type { PromiseInfo, ObservableRoot } from './observableInterfaces';
import { NodeValue } from './observableInterfaces';
import type { Observable, Opaque } from './observableInterfaces2';

type MaybePromise<T> = NonNullable<T> extends Promise<infer U> ? (U & PromiseInfo) | Extract<T, undefined> : T;

function createObservable<T>(value: T, makePrimitive: true): Observable<MaybePromise<Opaque<T>>>;
function createObservable<T>(value: T, makePrimitive: false): Observable<MaybePromise<T>>;
function createObservable<T>(value: T, makePrimitive: boolean): Observable<T> {
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore type too complex
    return createObservable(value, /*makePrimitive*/ false);
}

export function observablePrimitive<T>(): Observable<MaybePromise<Opaque<T | undefined>>>;
export function observablePrimitive<T>(value: T): Observable<MaybePromise<Opaque<T>>>;
export function observablePrimitive<T>(value?: T): Observable<MaybePromise<Opaque<T | undefined>>> {
    return createObservable(value, /*makePrimitive*/ true);
}
