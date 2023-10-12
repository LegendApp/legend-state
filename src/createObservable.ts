import { extractPromise } from './ObservableObject';
import { isActualPrimitive, isPromise } from './is';
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
    createObject: Function,
    createPrimitive?: Function,
): ObservablePrimitive<T> | ObservableObjectOrArray<T> {
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
        ? (new (createPrimitive as ClassConstructor<T>)(node) as ObservablePrimitive<T>)
        : (createObject(node) as ObservableObjectOrArray<T>);

    if (valueIsPromise) {
        extractPromise(node, value);
    }

    return obs;
}
