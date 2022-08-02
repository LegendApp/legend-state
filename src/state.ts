import { PathNode } from './observableInterfaces';
export default {
    isTracking: false,
    trackingShallow: false,
    trackingEqualityFn: undefined as (value: any) => any,
    trackedNodes: [] as {
        node: PathNode;
        key: string;
        shallow?: boolean;
        equalityFn?: (value: any) => any;
        value: any;
    }[],
    updateTracking(node: PathNode, key: string, value: any) {
        this.trackedNodes.push({
            node,
            key,
            shallow: this.trackingShallow,
            equalityFn: this.trackingEqualityFn,
            value,
        });
    },
};
