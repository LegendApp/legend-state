import type { ListenerFn, NodeInfo, TrackingNode } from './observableInterfaces';
import { onChange } from './onChange';

export function setupTracking(
    nodes: Map<NodeInfo, TrackingNode> | undefined,
    update: ListenerFn,
    noArgs?: boolean,
    immediate?: boolean,
) {
    let listeners: (() => void)[] | undefined = [];

    // Listen to tracked nodes
    nodes?.forEach((tracked) => {
        const { node, track } = tracked;
        listeners!.push(onChange(node, update, { trackingType: track, immediate, noArgs }));
    });

    return () => {
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                listeners[i]();
            }
            listeners = undefined;
        }
    };
}
