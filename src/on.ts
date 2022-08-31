import { getNodeValue } from './globals';
import { isObjectEmpty } from './is';
import { ListenerFn, ObservableListenerDispose, OnReturnValue, NodeValue } from './observableInterfaces';

const symbolHasValue = Symbol('__hasValue');
let listenerIndex = 0;

export function onEquals<T>(node: NodeValue, value: T, callback: (value: T) => void): OnReturnValue<T> {
    let dispose: ObservableListenerDispose;

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

                dispose?.();
            }
            return isDone;
        }
        dispose = onChange(node, check, true, /*shallow*/ true);
    });

    return {
        promise,
        dispose,
    };
}

export function onHasValue<T>(node: NodeValue, callback: (value: T) => void): OnReturnValue<T> {
    return onEquals(node, symbolHasValue as any, callback);
}

export function onTrue<T extends boolean>(node: NodeValue, callback?: () => void): OnReturnValue<T> {
    return onEquals(node, true as T, callback);
}

export function onChange(node: NodeValue, callback: ListenerFn<any>, runImmediately?: boolean, shallow?: boolean) {
    let id = listenerIndex++ as unknown as string;
    let listeners = node.listeners;
    if (!listeners) {
        node.listeners = listeners = new Map();
    }

    // A memory efficient way to save shallowness is to put it on the id itself
    if (shallow) id = 's' + id;

    listeners.set(id, callback);

    if (runImmediately) {
        const value = getNodeValue(node);
        callback(value, () => value, [], value, value, node);
    }

    return () => listeners.delete(id);
}

export function onChangeShallow(node: NodeValue, callback: ListenerFn<any>, runImmediately?: boolean) {
    return onChange(node, callback, runImmediately, /*shallow*/ true);
}
