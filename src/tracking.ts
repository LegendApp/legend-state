import type { NodeValue, TrackingNode } from './observableInterfaces';

let lastNode: NodeValue;

export const tracking = {
    nodes: undefined as Record<number, TrackingNode>,
    listeners: undefined as (nodes: Record<number, TrackingNode>) => void,
    updates: undefined as (fn: () => void) => () => void,
};

export function updateTracking(node: NodeValue, parent?: NodeValue, shallow?: boolean, manual?: boolean) {
    if (parent) {
        untrack(parent);
    }
    lastNode = node;
    const existing = tracking.nodes[node.id];
    if (existing) {
        existing.shallow = existing.shallow || shallow;
        existing.manual = existing.manual || manual;
        existing.num++;
    } else {
        tracking.nodes[node.id] = { node, shallow, manual, num: 1 };
    }
}

export function untrack(node: NodeValue) {
    const tracked = tracking.nodes[node.id];
    if (tracked && !tracked.manual) {
        if (tracked.num === 1) {
            delete tracking.nodes[node.id];
        } else {
            tracked.num--;
        }
    }
}
