/* eslint-disable @typescript-eslint/no-unused-vars */
import { extractPromise, getProxy } from './ObservableObject';
import { ObservableBooleanClass } from './ObservablePrimitive';
import { isActualPrimitive, isPromise } from './is';
import type { ObservableRoot } from './nodeValueTypes';
import { NodeValue } from './nodeValueTypes';
import type { Observable, ObservablePrimitive } from './observableTypes';

function createObservable<T>(value: T, makePrimitive: true): ObservablePrimitive<T>;
function createObservable<T>(value: T, makePrimitive: false): Observable<T>;
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
        ? (new ObservableBooleanClass(node) as unknown as Observable<T>)
        : (getProxy(node) as Observable<T>);

    if (valueIsPromise) {
        extractPromise(node, value);
    }

    return obs;
}

export function observable<T>(): Observable<T | undefined>;
export function observable<T>(value: T): Observable<T>;
export function observable<T>(value?: T): Observable<T | undefined> {
    return createObservable(value, /*makePrimitive*/ false);
}

export function observablePrimitive<T>(): ObservablePrimitive<T | undefined>;
export function observablePrimitive<T>(value: T): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<T | undefined> {
    return createObservable(value, /*makePrimitive*/ true);
}
