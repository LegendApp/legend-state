import type { NodeValue, TrackingNode } from './observableInterfaces';

export const tracking = {
    nodes: undefined as Map<number, TrackingNode>,
};
export function updateTracking(node: NodeValue, shallow?: boolean) {
    const existing = tracking.nodes.get(node.id);
    if (existing) {
        existing.shallow = existing.shallow === undefined || (existing.shallow === true && !shallow);
    } else {
        tracking.nodes.set(node.id, { node, shallow });
    }
}
