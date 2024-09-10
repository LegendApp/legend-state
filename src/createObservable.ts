import { isObservable, setNodeValue } from './globals';
import { isActualPrimitive, isFunction, isPromise } from './is';
import type { ClassConstructor, NodeInfo, ObservableRoot } from './observableInterfaces';
import { Observable, ObservablePrimitive } from './observableTypes';

export function createObservable<T>(
    value: T | undefined,
    makePrimitive: boolean,
    extractPromise: Function,
    createObject: Function,
    createPrimitive?: Function,
): Observable<T> {
    if (isObservable(value)) {
        return value as Observable<T>;
    }
    const valueIsPromise = isPromise<T>(value);
    const valueIsFunction = isFunction(value);

    const root: ObservableRoot = {
        _: value,
    };

    let node: NodeInfo = {
        root,
        lazy: true,
        numListenersRecursive: 0,
    };

    if (valueIsFunction) {
        node = Object.assign(() => {}, node);
        node.lazyFn = value;
    }

    const prim = makePrimitive || isActualPrimitive(value);

    const obs = prim
        ? (new (createPrimitive as ClassConstructor<T>)(node) as ObservablePrimitive<T>)
        : (createObject(node) as Observable<T>);

    if (valueIsPromise) {
        setNodeValue(node, undefined);
        extractPromise(node, value);
    }

    return obs as any;
}
