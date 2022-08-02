import { EqualityFn, Observable, PathNode } from './observableInterfaces';
export default {
    isTracking: false,
    trackingShallow: false,
    trackingEqualityFn: undefined as (value: any) => any,
    trackedNodes: [] as { node: PathNode; shallow?: boolean; equalityFn?: (value: any) => any; value: any }[],
};
