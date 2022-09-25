import { ListenerFn, ListenerNode, NodeValue, TrackingType } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    track?: TrackingType,
    noArgs?: boolean
): () => void {
    const listenerNode: ListenerNode = {
        listener: callback,
        track: track,
        noArgs: noArgs,
        prev: undefined,
        next: node.listeners,
    };

    if (node.listeners) {
        node.listeners.prev = listenerNode;
    }

    node.listeners = listenerNode;

    return () => {
        const { prev, next } = listenerNode;
        if (prev) {
            prev.next = next;
            listenerNode.prev = undefined;
        }
        if (next) {
            next.prev = prev;
            listenerNode.next = undefined;
        }
        if (node.listeners === listenerNode) {
            node.listeners = next;
        }
    };
}
