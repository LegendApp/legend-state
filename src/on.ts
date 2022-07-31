import { isFunction, isObjectEmpty, isString } from '@legendapp/tools';
import { getNodeValue, getParentNode, getPathNode } from './globals';
import { ListenerFn3, ObservableListener3, OnReturnValue3, PathNode } from './observableInterfaces';

const symbolHasValue = Symbol('__hasValue');

export function disposeListener(listener: ObservableListener3) {
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
): OnReturnValue3<T> {
    if (!isFunction(valueOrCallback)) {
        node = getPathNode(node.root, node.path, keyOrValue as string);
        keyOrValue = valueOrCallback;
        valueOrCallback = callbackOnChild;
    }

    let listener: ObservableListener3<T>;

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
            listener = onChange(/*shallow*/ false, node, check);
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
): OnReturnValue3<T> {
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
): OnReturnValue3<T> {
    if (isString(keyOrCallback)) {
        node = getPathNode(node.root, node.path, keyOrCallback);
        keyOrCallback = callbackOnChild;
    }
    return onEquals(node, true as T, keyOrCallback);
}

export function onChange(
    shallow: boolean,
    node: PathNode,
    keyOrCallback: string | ListenerFn3<any>,
    callbackOnChild?: ListenerFn3<any>
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
    } as Partial<ObservableListener3>;
    listener.dispose = disposeListener.bind(listener, listener);

    if (!node.listeners) {
        node.listeners = new Set();
    }
    node.listeners.add(listener as ObservableListener3);

    return listener as ObservableListener3;
}
