import { extractPromise, getProxy, peekInternal } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { createObservable } from './createObservable';
import { getNode } from './globals';
import type { Observable, ObservableParam, ObservablePrimitive, RecursiveValueOrFunction } from './observableTypes';
import type { ObservableSyncState } from './sync/syncTypes';

export function observable<T>(): Observable<T | undefined>;
export function observable<T>(
    value: Promise<RecursiveValueOrFunction<T>> | (() => RecursiveValueOrFunction<T>) | RecursiveValueOrFunction<T>,
): Observable<T>;
export function observable<T>(value: T): Observable<T>;
export function observable<T>(value?: T): Observable<any> {
    return createObservable(value, false, extractPromise, getProxy, ObservablePrimitiveClass) as any;
}

export function observablePrimitive<T>(value: Promise<T>): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T> {
    return createObservable(value, true, extractPromise, getProxy, ObservablePrimitiveClass) as any;
}

export function syncState(obs: ObservableParam) {
    const node = getNode(obs);
    if (!node.state) {
        peekInternal(node);
    }
    if (!node.state) {
        node.state = observable({} as ObservableSyncState);
    }
    return node.state!;
}
