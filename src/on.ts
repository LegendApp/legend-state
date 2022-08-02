import { getNodeValue } from './globals';
import { isObjectEmpty } from './is';
import { ListenerFn, ObservableListener, OnReturnValue, ProxyValue } from './observableInterfaces';

const symbolHasValue = Symbol('__hasValue');

export function disposeListener(listener: ObservableListener) {
    if (listener && !listener.isDisposed) {
        listener.isDisposed = true;
        const listeners = listener.node.root.listenerMap.get(listener.node.path);
        if (listeners) {
            listeners.delete(listener);
        }
    }
}

export function onEquals<T>(node: ProxyValue, value: T, callback: (value: T) => void): OnReturnValue<T> {
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

export function onHasValue<T>(node: ProxyValue, callback: (value: T) => void): OnReturnValue<T> {
    return onEquals(node, symbolHasValue as any, callback);
}

export function onTrue<T extends boolean>(node: ProxyValue, callback?: () => void): OnReturnValue<T> {
    return onEquals(node, true as T, callback);
}

export function onChange(node: ProxyValue, callback: ListenerFn<any>, shallow?: boolean) {
    const listener: ObservableListener = {
        node,
        callback,
        shallow,
        // function, not () => {} to preserve this
        dispose: function () {
            disposeListener(this);
        },
    };

    const map = node.root.listenerMap;
    let listeners = map.get(node.path);
    if (!listeners) {
        listeners = new Set();
        map.set(node.path, listeners);
    }
    listeners.add(listener);

    return listener;
}

export function onChangeShallow(node: ProxyValue, callback: ListenerFn<any>) {
    return onChange(node, callback, /*shallow*/ true);
}
