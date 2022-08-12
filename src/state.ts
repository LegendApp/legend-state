import type { NodeValue, TrackingNode } from './observableInterfaces';

export const tracking = {
    shallow: false,
    nodes: [] as TrackingNode[],
};
export function updateTracking(node: NodeValue, value: any) {
    tracking.nodes.push({
        node,
        shallow: tracking.shallow,
        value,
    });
}
