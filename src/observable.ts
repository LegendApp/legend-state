import {
    __devExtractFunctionsAndComputedsNodes,
    extractFunctionsAndComputeds,
    extractPromise,
    getProxy,
} from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { isActualPrimitive, isPromise } from './is';
import type {
    Observable,
    ObservableObjectOrArray,
    ObservablePrimitive,
    ObservableRoot,
    PromiseInfo,
} from './observableInterfaces';
import { NodeValue } from './observableInterfaces';

function createObservable<T>(value: Promise<T>, makePrimitive?: true): ObservablePrimitive<T & PromiseInfo>;
function createObservable<T>(value?: T, makePrimitive?: true): ObservablePrimitive<T>;
function createObservable<T>(
    value?: Promise<T>,
    makePrimitive?: boolean,
): ObservablePrimitive<T & PromiseInfo> | ObservableObjectOrArray<T & PromiseInfo>;
function createObservable<T>(value?: T, makePrimitive?: boolean): ObservablePrimitive<T> | ObservableObjectOrArray<T> {
    const valueIsPromise = isPromise<T>(value);
    const root: ObservableRoot = {
        _: value,
    };

    const node: NodeValue = {
        root,
    };

    const prim = makePrimitive || isActualPrimitive(value);

    const obs = prim
        ? (new (ObservablePrimitiveClass as any)(node) as ObservablePrimitive<T>)
        : (getProxy(node) as ObservableObjectOrArray<T>);

    if (valueIsPromise) {
        extractPromise(node, value);
    } else if (!prim) {
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            __devExtractFunctionsAndComputedsNodes!.clear();
        }
        if (value) {
            extractFunctionsAndComputeds(node, value);
        }
    }

    return obs;
}

export function observable<T>(value: Promise<T>): Observable<T & PromiseInfo>;
export function observable<T>(value?: T): Observable<T>;
export function observable<T>(value?: T | Promise<T>): Observable<T & PromiseInfo> {
    return createObservable(value) as Observable<T & PromiseInfo>;
}

export function observablePrimitive<T>(value: Promise<T>): ObservablePrimitive<T & PromiseInfo>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T & PromiseInfo> {
    return createObservable(value, /*makePrimitive*/ true) as ObservablePrimitive<T & PromiseInfo>;
}
