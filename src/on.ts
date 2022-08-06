import { getNodeValue } from './globals';
import { isObjectEmpty } from './is';
import {
    ListenerFn,
    ListenerFnSaved,
    ObservableListenerDispose,
    OnReturnValue,
    ProxyValue,
} from './observableInterfaces';

const symbolHasValue = Symbol('__hasValue');

export function onEquals<T>(node: ProxyValue, value: T, callback: (value: T) => void): OnReturnValue<T> {
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

                dispose();
            }
            return isDone;
        }
        if (!check(getNodeValue(node))) {
            dispose = onChange(node, check, /*shallow*/ true);
        }
    });

    return {
        promise,
        dispose,
    };
}

export function onHasValue<T>(node: ProxyValue, callback: (value: T) => void): OnReturnValue<T> {
    return onEquals(node, symbolHasValue as any, callback);
}

export function onTrue<T extends boolean>(node: ProxyValue, callback?: () => void): OnReturnValue<T> {
    return onEquals(node, true as T, callback);
}

export function onChange(node: ProxyValue, callback: ListenerFn<any>, shallow?: boolean) {
    const c = callback as ListenerFnSaved;
    if (shallow) {
        c.shallow = true;
    }
    const map = node.root.listenerMap;
    let listeners = map.get(node.path);
    if (!listeners) {
        listeners = [];
        map.set(node.path, listeners);
    }
    listeners.push(c);

    return () => listeners.splice(listeners.indexOf(c), 1);
}

export function onChangeShallow(node: ProxyValue, callback: ListenerFn<any>) {
    return onChange(node, callback, /*shallow*/ true);
}
