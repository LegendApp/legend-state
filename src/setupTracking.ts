import type { ListenerFn, NodeValue, TrackingNode } from './observableInterfaces';
import { onChange } from './onChange';

export function setupTracking(
    nodes: Map<NodeValue, TrackingNode> | undefined,
    update: ListenerFn,
    noArgs?: boolean,
    immediate?: boolean,
) {
    let listeners: (() => void)[] | undefined = [];

    // Listen to tracked nodes
    nodes?.forEach((tracked) => {
        const { node, shallow } = tracked;
        listeners!.push(onChange(node, update, { shallow, immediate, noArgs }));
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
