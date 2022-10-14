import type { ListenerFn, NodeValue, TrackingType } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    track?: TrackingType,
    noArgs?: boolean
): () => void {
    let listeners = node.listeners;
    if (!listeners) {
        node.listeners = listeners = new Set();
    }

    const listener = { listener: callback, track: track, noArgs };

    listeners.add(listener);

    return () => listeners.delete(listener);
}
