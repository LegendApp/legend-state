import { ListenerFn, NodeValue } from './observableInterfaces';

export function onChange(node: NodeValue, callback: ListenerFn<any>, track?: boolean | Symbol): () => void {
    let listeners = node.listeners;
    if (!listeners) {
        node.listeners = listeners = new Set();
    }

    const listener = { listener: callback, track: track };

    listeners.add(listener);

    return () => listeners.delete(listener);
}
