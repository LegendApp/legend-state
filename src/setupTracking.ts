import type { ListenerFn, TrackingNode } from './observableInterfaces';
import { onChange } from './onChange';

export function setupTracking(
    nodes: Map<number, TrackingNode> | undefined,
    update: ListenerFn<any>,
    noArgs?: boolean,
    immediate?: boolean
) {
    let listeners: (() => void)[] | undefined = [];
    // Listen to tracked nodes
    if (nodes) {
        for (const tracked of nodes.values()) {
            const { node, track } = tracked;
            listeners.push(onChange(node, update, { trackingType: track, immediate }, noArgs));
        }
    }

    return () => {
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                listeners[i]();
            }
            listeners = undefined;
        }
    };
}
