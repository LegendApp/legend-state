import type { NodeValue, TrackingNode, TrackingType } from './observableInterfaces';

let lastNode: NodeValue;

export const tracking = {
    isTracking: 0,
    nodes: undefined as Map<number, TrackingNode>,
    listeners: undefined as (nodes: Map<number, TrackingNode>) => void,
    updates: undefined as (fn: () => void) => () => void,
};

export function beginTracking() {
    // Keep a copy of the previous tracking context so it can be restored
    // when this context is complete
    const prev = tracking.nodes;
    tracking.isTracking++;
    tracking.nodes = undefined;
    return prev;
}
export function endTracking(prevNodes: Map<number, TrackingNode>) {
    // Restore the previous tracking context
    tracking.isTracking--;
    if (tracking.isTracking < 0) {
        tracking.isTracking = 0;
        if (process.env.NODE_ENV === 'development') {
            // Shouldn't be possible, but leave as a sanity check
            debugger;
        }
    }
    tracking.nodes = prevNodes;
}

export function updateTracking(node: NodeValue, track?: TrackingType) {
    if (tracking.isTracking) {
        if (!tracking.nodes) {
            tracking.nodes = new Map();
        }
        lastNode = node;
        const existing = tracking.nodes.get(node.id);
        if (existing) {
            existing.track = existing.track || track;
            existing.num++;
        } else {
            tracking.nodes.set(node.id, { node, track, num: 1 });
        }
    }
}

export function untrack(node: NodeValue) {
    if (tracking.nodes) {
        const tracked = tracking.nodes.get(node.id);
        if (tracked) {
            if (tracked.num === 1) {
                tracking.nodes.delete(node.id);
            } else {
                tracked.num--;
            }
        }
    }
}

export function checkTracking(node: NodeValue, track: TrackingType) {
    if (tracking.isTracking) {
        if (track) {
            updateTracking(node, track);
        } else {
            untrack(node);
        }
    }
}
