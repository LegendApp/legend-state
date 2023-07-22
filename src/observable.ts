import { getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { __devExtractFunctionsAndComputedsNodes, extractFunctionsAndComputeds } from './globals';
import { isActualPrimitive, isPromise } from './is';
import type {
    NodeValue,
    Observable,
    ObservableObjectOrArray,
    ObservablePrimitive,
    ObservableRoot,
} from './observableInterfaces';

function createObservable<T>(value?: T | Promise<T>, makePrimitive?: true): ObservablePrimitive<T>;
function createObservable<T>(
    value?: T | Promise<T>,
    makePrimitive?: boolean,
): ObservablePrimitive<T> | ObservableObjectOrArray<T> {
    const valueIsPromise = isPromise<T>(value);
    const root: ObservableRoot = {
        _: valueIsPromise ? undefined : value,
    };

    const node: NodeValue = {
        root,
    };

    const prim = makePrimitive || isActualPrimitive(value);

    const obs = prim
        ? (new (ObservablePrimitiveClass as any)(node) as ObservablePrimitive<T>)
        : (getProxy(node) as ObservableObjectOrArray<T>);

    if (valueIsPromise) {
        value.catch((error) => {
            obs.set({ error } as any);
        });
        value.then((value) => {
            obs.set(value);
        });
    } else if (!prim) {
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            __devExtractFunctionsAndComputedsNodes!.clear();
        }
        if (value) {
            extractFunctionsAndComputeds(value, node);
        }
    }

    return obs;
}

export function observable<T>(value?: T | Promise<T>): Observable<T> {
    return createObservable(value) as Observable<T>;
}

export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T> {
    return createObservable<T>(value, /*makePrimitive*/ true);
}
