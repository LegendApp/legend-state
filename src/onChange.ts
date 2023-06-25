import { checkActivate, getNodeValue, optimized } from './globals';
import type { ListenerFn, NodeValue, NodeValueListener, TrackingType } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    options: {
        trackingType?: TrackingType;
        initial?: boolean;
        immediate?: boolean;
        priority?: boolean;
        noArgs?: boolean;
    } = {}
): () => void {
    const { initial, immediate, priority, noArgs } = options;
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

    const listenersName: keyof NodeValue = immediate ? 'listenersImmediate' : 'listeners';

    let listeners = node[listenersName];
    if (!listeners) {
        listeners = node[listenersName] = new Set();
    }
    checkActivate(node);

    const listener: NodeValueListener = {
        listener: callback,
        track: trackingType,
        noArgs,
        priority,
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
