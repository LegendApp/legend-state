import { checkActivate, getNodeValue, optimized } from './globals';
import type { ListenerFn, NodeValue, NodeValueListener, Observable, TrackingType } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn,
    options: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean } = {}
): () => void {
    const { initial, immediate, noArgs } = options;
    let { trackingType } = options;

    // Temporary migration of string to symbol
    if (trackingType === 'optimize') {
        if (process.env.NODE_ENV === 'development') {
            console.log(
                '[legend-state]: "optimize" prop is deprecated and will be removed in the next major version. Please import { optimize } from "@legendapp/state" and use that instead.'
            );
        }
        trackingType = optimized;
    }

    let listeners = immediate ? node.listenersImmediate : node.listeners;
    if (!listeners) {
        listeners = new Set();
        if (immediate) {
            node.listenersImmediate = listeners;
        } else {
            node.listeners = listeners;
        }
    }
    checkActivate(node);

    const listener: NodeValueListener = {
        listener: callback,
        track: trackingType,
        noArgs,
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
            name: node.root.name,
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
            source: node.root.obs as Observable<any>,
        });
    }

    return () => listeners!.delete(listener);
}
