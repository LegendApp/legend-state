import { getNodeValue } from './globals';
import { ListenerFn, NodeValue } from './observableInterfaces';

let listenerIndex = 0;

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    options?: { runImmediately?: boolean; shallow?: boolean; optimized?: boolean }
) {
    let id = listenerIndex++ as unknown as string;
    let listeners = node.listeners;
    if (!listeners) {
        node.listeners = listeners = new Map();
    }

    if (options) {
        // A memory efficient way to save shallowness is to put it on the id itself
        if (options.shallow) id = 's' + id;
        else if (options.optimized) id = 'o' + id;

        if (options.runImmediately) {
            const value = getNodeValue(node);
            callback(value, () => value, [], value, value, node.proxy);
        }
    }

    listeners.set(id, callback);

    return () => listeners.delete(id);
}
