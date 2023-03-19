import { checkActivate, getNodeValue } from './globals';
import type { ListenerFn, NodeValue, NodeValueListener, TrackingType } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean },
    noArgs?: boolean
): () => void {
    let listeners = node.listeners;
    if (!listeners) {
        node.listeners = listeners = new Set();
    }
    checkActivate(node);

    const { trackingType, initial, immediate } = options || {};

    const listener: NodeValueListener = {
        listener: callback,
        track: trackingType,
        noArgs,
        immediate: immediate,
    };

    listeners.add(listener);

    let parent = node.parent;
    while (parent && !parent.descendantHasListener) {
        parent.descendantHasListener = true;
        parent = parent.parent;
    }

    if (initial) {
        const value = getNodeValue(node);
        callback({
            value,
            changes: [
                {
                    path: [],
                    pathTypes: [],
                    prevAtPath: value,
                    valueAtPath: value,
                },
            ],
            getPrevious: () => undefined,
        });
    }

    return () => listeners!.delete(listener);
}
