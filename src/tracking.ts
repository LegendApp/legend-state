import type { NodeValue, TrackingNode } from './observableInterfaces';

let lastNode: NodeValue;

export const tracking = {
    nodes: undefined as Map<number, TrackingNode>,
    listeners: undefined as (nodes: Map<number, TrackingNode>) => void,
    updates: undefined as (fn: () => void) => () => void,
};

export function updateTracking(node: NodeValue, parent?: NodeValue, track?: boolean | Symbol, manual?: boolean) {
    if (parent) {
        untrack(parent);
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

export function untrack(node: NodeValue) {
    const tracked = tracking.nodes.get(node.id);
    if (tracked && !tracked.manual) {
        if (tracked.num === 1) {
            tracking.nodes.delete(node.id);
        } else {
            tracked.num--;
        }
    }
}
