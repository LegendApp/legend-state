import { ProxyValue } from './observableInterfaces';
export default {
    isTracking: false,
    trackingShallow: false,
    trackingShouldRender: undefined as (value: any, prev?: any) => any,
    trackedNodes: [] as {
        node: ProxyValue;
        shallow?: boolean;
        shouldRender?: (value: any, prev?: any) => any;
        value: any;
    }[],
    updateTracking(node: ProxyValue, value: any) {
        this.trackedNodes.push({
            node,
            shallow: this.trackingShallow,
            shouldRender: this.trackingShouldRender,
            value,
        });
    },
};
