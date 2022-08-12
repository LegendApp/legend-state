import type { NodeValue, TrackingNode } from './observableInterfaces';

export const tracking = {
    nodes: [] as TrackingNode[],
};
export function updateTracking(node: NodeValue, shallow?: boolean) {
    tracking.nodes.push({
        node,
        shallow: shallow,
    });
}
