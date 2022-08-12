import type { NodeValue, TrackingNode } from './observableInterfaces';

export const tracking = {
    shallow: false,
    nodes: [] as TrackingNode[],
};
export function updateTracking(node: NodeValue, value: any, shallow?: boolean) {
    tracking.nodes.push({
        node,
        shallow: shallow || tracking.shallow,
        value,
    });
}
