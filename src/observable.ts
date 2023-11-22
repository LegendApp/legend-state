import { ObservablePersistState } from './persistTypes';
import { extractPromise, getProxy, peek } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { createObservable } from './createObservable';
import { getNode, globalState } from './globals';
import type { Observable, ObservablePrimitive, ObservableReadable, RecursiveValueOrFunction } from './observableTypes';

export function observable<T>(): Observable<T | undefined>;
export function observable<T>(value: Promise<RecursiveValueOrFunction<T>> | RecursiveValueOrFunction<T>): Observable<T>;
export function observable<T>(value?: T): any {
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
        peek(node);
    }
    if (!node.state) {
        node.state = observable({} as ObservablePersistState);
    }
    return node.state!;
}

globalState.isLoadingRemote$ = observable(false);
