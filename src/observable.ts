import { extractPromise, getProxy, peekInternal } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { createObservable } from './createObservable';
import { getNode, globalState } from './globals';
import type { Observable, ObservablePrimitive, ObservableReadable, RecursiveValueOrFunction } from './observableTypes';
import { ObservablePersistState } from './persistTypes';

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

export function syncState(obs: ObservableReadable) {
    const node = getNode(obs);
    if (!node.state) {
        peekInternal(node);
    }
    if (!node.state) {
        node.state = observable({} as ObservablePersistState);
    }
    return node.state!;
}

globalState.isLoadingRemote$ = observable(false);
