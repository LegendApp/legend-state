import type { NodeValue, TrackingNode } from './observableInterfaces';

export const tracking = {
    nodes: undefined as Map<number, TrackingNode>,
    listeners: undefined as (nodes: Map<number, TrackingNode>) => void,
    updates: undefined as (fn: () => void) => () => void,
};

export function updateTracking(node: NodeValue, parent?: NodeValue, shallow?: boolean, manual?: boolean) {
    if (parent) {
        untrack(parent);
    }
    const existing = tracking.nodes.get(node.id);
    if (existing) {
        existing.shallow = existing.shallow || shallow;
        existing.manual = existing.manual || manual;
    } else {
        tracking.nodes.set(node.id, { node, shallow, manual });
    }
}

export function untrack(node: NodeValue) {
    const tracked = tracking.nodes.get(node.id);
    if (tracked && !tracked.manual) {
        tracking.nodes.delete(node.id);
    }
}
