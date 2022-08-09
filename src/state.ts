import type { NodeValue, TrackingNode } from './observableInterfaces';

export const tracking = {
    is: false,
    shallow: false,
    should: undefined as (value: any, prev?: any) => any,
    nodes: [] as TrackingNode[],
};
export function updateTracking(node: NodeValue, value: any) {
    tracking.nodes.push({
        node,
        shallow: tracking.shallow,
        value,
    });
}
