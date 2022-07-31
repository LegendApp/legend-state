import { isFunction, isObjectEmpty, isString } from '@legendapp/tools';
import { getNodeValue, getParentNode, getPathNode } from './globals';
import { ListenerFn, ObservableListener, OnReturnValue, PathNode } from './observableInterfaces';

const symbolHasValue = Symbol('__hasValue');

export function disposeListener(listener: ObservableListener) {
    if (listener && !listener.isDisposed) {
        listener.isDisposed = true;
        listener.node.listeners.delete(listener);
    }
}

export function onEquals<T>(
    node: PathNode,
    keyOrValue: string | T,
    valueOrCallback: T | ((value: T) => void),
    callbackOnChild?: (value: T) => void
): OnReturnValue<T> {
    if (!isFunction(valueOrCallback)) {
        node = getPathNode(node.root, node.path, keyOrValue as string);
        keyOrValue = valueOrCallback;
        valueOrCallback = callbackOnChild;
    }

    let listener: ObservableListener<T>;

    const promise = new Promise<any>((resolve) => {
        let isDone = false;
        function check(newValue) {
            if (
                !isDone &&
                (keyOrValue === (symbolHasValue as any)
                    ? // If value param is symbolHasValue, then this is from onHasValue so resolve if newValue is anything but undefined or empty object
                      newValue !== undefined && newValue !== null && !isObjectEmpty(newValue)
                    : newValue === keyOrValue)
            ) {
                isDone = true;
                (valueOrCallback as (value: T) => void)?.(newValue);
                resolve(keyOrValue);

                disposeListener(listener);
            }
            return isDone;
        }
        if (!check(getNodeValue(node))) {
            listener = onChange(node, check, undefined, /*shallow*/ true);
        }
    });

    return {
        promise,
        listener,
    };
}

export function onHasValue<T>(
    node: PathNode,
    keyOrCallback: string | ((value: T) => void),
    callbackOnChild?: (value: T) => void
): OnReturnValue<T> {
    if (isString(keyOrCallback)) {
        node = getPathNode(node.root, node.path, keyOrCallback);
        keyOrCallback = callbackOnChild;
    }
    return onEquals(node, symbolHasValue as any, keyOrCallback);
}

export function onTrue<T extends boolean>(
    node: PathNode,
    keyOrCallback: string | (() => void),
    callbackOnChild?: () => void
): OnReturnValue<T> {
    if (isString(keyOrCallback)) {
        node = getPathNode(node.root, node.path, keyOrCallback);
        keyOrCallback = callbackOnChild;
    }
    return onEquals(node, true as T, keyOrCallback);
}

export function onChange(
    node: PathNode,
    keyOrCallback: string | ListenerFn<any>,
    callbackOnChild?: ListenerFn<any>,
    shallow?: boolean
) {
    if (isString(keyOrCallback)) {
        node = getPathNode(node.root, node.path, keyOrCallback as unknown as string);
        keyOrCallback = callbackOnChild;
    }

    const listener = {
        node,
        callback: keyOrCallback,
        path: node.path,
        shallow,
        // function, not () => {} to preserve this
        dispose: function () {
            disposeListener(this);
        },
    };

    if (!node.listeners) {
        node.listeners = new Set();
    }
    node.listeners.add(listener as ObservableListener);

    return listener as ObservableListener;
}

export function onChangeShallow(
    node: PathNode,
    keyOrCallback: string | ListenerFn<any>,
    callbackOnChild?: ListenerFn<any>
) {
    return onChange(node, keyOrCallback, callbackOnChild, /*shallow*/ true);
}
