import { ListenerFn, ListenerNode, NodeValue, TrackingType } from './observableInterfaces';

const listenerNodePool: ListenerNode[] = [];

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    track?: TrackingType,
    noArgs?: boolean
): () => void {
    const listenerNode: ListenerNode = listenerNodePool.pop() || ({} as ListenerNode);
    listenerNode.listener = callback;
    listenerNode.track = track;
    listenerNode.noArgs = noArgs;

    if (!node.listeners) {
        node.listeners = listenerNode;
    } else {
        listenerNode.next = node.listeners;
        node.listeners.prev = listenerNode;
        node.listeners = listenerNode;
    }
    listenerNode.active = true;

    return () => {
        const { prev, next } = listenerNode;
        if (node.listeners === listenerNode) {
            node.listeners = listenerNode.next;
        }
        if (prev) {
            prev.next = next;
            listenerNode.prev = undefined;
        }
        if (next) {
            next.prev = prev;
            listenerNode.next = undefined;
        }
        listenerNode.active = false;
        listenerNodePool.push(listenerNode);
    };
}
