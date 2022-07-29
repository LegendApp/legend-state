import { isFunction, isObjectEmpty, isString } from '@legendapp/tools';
import { callKeyed, getNodeValue, getPathNode } from './globals';
import {
    ObservableEventType,
    ObservableListener3,
    OnReturnValue,
    OnReturnValue3,
    PathNode,
} from './observableInterfaces';

const symbolHasValue = Symbol('__hasValue');

export function disposeListener(listener: ObservableListener3) {
    if (listener && !listener.isDisposed) {
        listener.isDisposed = true;
        listener.node.listeners.delete(listener);
    }
}

export function onEquals<T>(node: PathNode, key: string, value: T, callback?: (value: T) => void): OnReturnValue3<T> {
    if (arguments.length < 3 || isFunction(value)) return callKeyed(onHasValue, node, key);

    let listener: ObservableListener3<T>;

    const promise = new Promise<any>((resolve) => {
        let isDone = false;
        function check(newValue) {
            if (
                !isDone &&
                (value === (symbolHasValue as any)
                    ? // If value param is symbolHasValue, then this is from onHasValue so resolve if newValue is anything but undefined or empty object
                      newValue !== undefined && newValue !== null && !isObjectEmpty(newValue)
                    : newValue === value)
            ) {
                isDone = true;
                callback?.(newValue);
                resolve(value);

                disposeListener(listener);
            }
            return isDone;
        }
        if (!check(getNodeValue(node)[key])) {
            listener = _onChange(node, key, check, /*shallow*/ false);
        }
    });

    return {
        promise,
        listener,
    };
}

export function onHasValue<T>(node: PathNode, key: string, cb?: (value: T) => void): OnReturnValue3<T> {
    if (isFunction(key)) return callKeyed(onHasValue, node, key);
    return onEquals(node, key, symbolHasValue as any, cb);
}

export function onTrue<T extends boolean>(node: PathNode, key: string, cb?: () => void): OnReturnValue3<T> {
    if (isFunction(key)) return callKeyed(onTrue, node, key);
    return onEquals(node, key, true as T, cb);
}

function _onChange(node: PathNode, key: string, callback: (value, prevValue) => void, shallow: boolean) {
    if (arguments.length < 4) {
        return callKeyed(_onChange, node, key, callback, shallow);
    }
    const child = getPathNode(node.root, node.path, key);
    const listener = {
        node: child,
        callback,
        path: child.path,
        // pathStr: child.path,
        shallow,
    } as Partial<ObservableListener3>;
    listener.dispose = disposeListener.bind(listener, listener);

    if (!child.listeners) {
        child.listeners = new Set();
    }
    child.listeners.add(listener as ObservableListener3);

    return listener as ObservableListener3;
}

export function onChange(shallow: boolean, ...args: any[]) {
    return _onChange.call(this, ...args, shallow);
}

// const ObservableOnFunctions: Record<ObservableEventType, Function> = {
//     change: onChange.bind(this, /*shallow*/ false),
//     changeShallow: onChange.bind(this, /*shallow*/ true),
//     equals: onEquals,
//     hasValue: onHasValue,
//     true: onTrue,
// };

// export function _on(node: PathNode, type: ObservableEventType, ...args: any[]);
// export function _on(node: PathNode, key: string, type: ObservableEventType, ...args: any[]);
// export function _on(
//     node: PathNode,
//     key: string | ObservableEventType,
//     type: ((value, prevValue) => void) | ObservableEventType,
//     ...args: any[]
// ) {
//     if (arguments.length < 4) {
//         if (node.path.length > 0) {
//             const last = node.path[node.path.length - 1];
//             return _on(
//                 { path: node.path.slice(0, -1), root: node.root },
//                 last,
//                 key as ObservableEventType,
//                 type as (value, prevValue) => void
//             );
//         } else debugger;
//         // return _on({ root: node.root, path: })
//     } else {
//         const child: PathNode = {
//             path: node.path.concat(key),
//             root: node.root,
//         };
//         return ObservableOnFunctions[type as ObservableEventType](child, ...args);
//     }
// }
