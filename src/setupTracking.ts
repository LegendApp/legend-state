import type { ListenerFn, NodeInfo, TrackingNode, TrackingType } from './observableInterfaces';
import { onChange } from './onChange';

export type TrackingSubscriptions = Map<NodeInfo, { track: TrackingType; dispose: () => void }>;

// onChange attaches listeners for links at subscribe time, so linked nodes always resubscribe
function hasLinks(node: NodeInfo) {
    if (node.linkedToNode || node.linkedFromNodes?.size) return true;
    for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.linkedFromNodes?.size) return true;
    }
    return false;
}

export function setupTracking(
    nodes: Map<NodeInfo, TrackingNode> | undefined,
    update: ListenerFn,
    noArgs?: boolean,
    immediate?: boolean,
    previous?: TrackingSubscriptions,
) {
    let subscriptions: TrackingSubscriptions | undefined = new Map();

    // Keep previous listeners for nodes tracked the same way, and remove the rest before
    // adding new ones so subscriptions never overlap
    previous?.forEach((subscription, node) => {
        const tracked = nodes?.get(node);
        if (!tracked || tracked.track !== subscription.track || hasLinks(node)) {
            subscription.dispose();
            previous.delete(node);
        }
    });

    nodes?.forEach(({ node, track }) => {
        subscriptions!.set(
            node,
            previous?.get(node) || {
                track,
                dispose: onChange(node, update, { trackingType: track, immediate, noArgs }),
            },
        );
    });
    previous?.clear();

    return {
        subscriptions,
        dispose: () => {
            subscriptions?.forEach((subscription) => subscription.dispose());
            subscriptions = undefined;
        },
    };
}
