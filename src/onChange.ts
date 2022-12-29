import { getNodeValue } from './globals';
import { doNotify } from './notify';
import type { ListenerFn, NodeValue, TrackingType } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    options?: { trackingType?: TrackingType; initial?: boolean },
    noArgs?: boolean
): () => void {
    let listeners = node.listeners;
    if (!listeners) {
        node.listeners = listeners = new Set();
    }

    const listener = { listener: callback, track: options?.trackingType, noArgs };

    listeners.add(listener);

    if (options?.initial) {
        const value = getNodeValue(node);
        doNotify(node, value, [], value, value, 0);
    }

    return () => listeners!.delete(listener);
}
