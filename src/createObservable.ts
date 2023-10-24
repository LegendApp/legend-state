import { cloneFunction, setNodeValue } from './globals';
import { isActualPrimitive, isFunction, isPromise } from './is';
import type {
    ClassConstructor,
    ObservableObjectOrArray,
    ObservablePrimitive,
    ObservableRoot,
} from './observableInterfaces';
import { NodeValue } from './observableInterfaces';

export function createObservable<T>(
    value: T | undefined,
    makePrimitive: boolean,
    extractPromise: Function,
    createObject: Function,
    createPrimitive?: Function,
): ObservablePrimitive<T> | ObservableObjectOrArray<T> {
    const valueIsPromise = isPromise<T>(value);
    const valueIsFunction = isFunction(value);

    const root: ObservableRoot = {
        _: value,
    };

    let node: NodeValue = {
        root,
        lazy: true,
    };

    if (valueIsFunction) {
        node = Object.assign(cloneFunction(value), node);
    }

    const prim = makePrimitive || isActualPrimitive(value);

    const obs = prim
        ? (new (createPrimitive as ClassConstructor<T>)(node) as ObservablePrimitive<T>)
        : (createObject(node) as ObservableObjectOrArray<T>);

    if (valueIsPromise) {
        setNodeValue(node, undefined);
        extractPromise(node, value);
    }

    return obs;
}
