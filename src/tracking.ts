import type { NodeValue, TrackingNode } from './observableInterfaces';

let lastNode: NodeValue;

export const tracking = {
    isTracking: false,
    nodes: undefined as Map<number, TrackingNode>,
    listeners: undefined as (nodes: Map<number, TrackingNode>) => void,
    updates: undefined as (fn: () => void) => () => void,
};

export function beginTracking() {
    const prev = tracking.nodes;
    tracking.isTracking = true;
    tracking.nodes = undefined;
    return prev;
}
export function endTracking(prevNodes: Map<number, TrackingNode>) {
    tracking.isTracking = false;
    tracking.nodes = prevNodes;
}

export function updateTracking(node: NodeValue, track?: boolean | Symbol, manual?: boolean) {
    if (tracking.isTracking) {
        if (!tracking.nodes) {
            tracking.nodes = new Map();
        }
        lastNode = node;
        const existing = tracking.nodes.get(node.id);
        if (existing) {
            existing.track = existing.track || track;
            existing.manual = existing.manual || manual;
            existing.num++;
        } else {
            tracking.nodes.set(node.id, { node, track, manual, num: 1 });
        }
    }
}

export function untrack(node: NodeValue) {
    if (tracking.nodes) {
        const tracked = tracking.nodes.get(node.id);
        if (tracked && !tracked.manual) {
            if (tracked.num === 1) {
                tracking.nodes.delete(node.id);
            } else {
                tracked.num--;
            }
        }
    }
}

export function checkTracking(node: NodeValue, track: boolean | Symbol) {
    if (tracking.isTracking) {
        if (track) {
            updateTracking(node, track, /*manual*/ true);
        } else {
            untrack(node);
        }
    }
}
