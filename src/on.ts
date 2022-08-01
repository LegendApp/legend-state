import { getNodeValue } from './globals';
import { isObjectEmpty } from './is';
import { ListenerFn, ObservableListener, OnReturnValue, PathNode } from './observableInterfaces';

const symbolHasValue = Symbol('__hasValue');

export function disposeListener(listener: ObservableListener) {
    if (listener && !listener.isDisposed) {
        listener.isDisposed = true;
        listener.node.listeners.delete(listener);
    }
}

export function onEquals<T>(node: PathNode, value: T, callback: (value: T) => void): OnReturnValue<T> {
    let listener: ObservableListener<T>;

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
                (callback as (value: T) => void)?.(newValue);
                resolve(newValue);

                disposeListener(listener);
            }
            return isDone;
        }
        if (!check(getNodeValue(node))) {
            listener = onChange(node, check, /*shallow*/ true);
        }
    });

    return {
        promise,
        listener,
    };
}

export function onHasValue<T>(node: PathNode, callback: (value: T) => void): OnReturnValue<T> {
    return onEquals(node, symbolHasValue as any, callback);
}

export function onTrue<T extends boolean>(node: PathNode, callback?: () => void): OnReturnValue<T> {
    return onEquals(node, true as T, callback);
}

export function onChange(node: PathNode, callback: ListenerFn<any>, shallow?: boolean) {
    const listener: ObservableListener = {
        node,
        callback,
        shallow,
        // function, not () => {} to preserve this
        dispose: function () {
            disposeListener(this);
        },
    };

    if (!node.listeners) {
        node.listeners = new Set();
    }
    node.listeners.add(listener);

    return listener;
}

export function onChangeShallow(node: PathNode, callback: ListenerFn<any>) {
    return onChange(node, callback, /*shallow*/ true);
}
