import type { ProxyValue } from './observableInterfaces';

export const tracking = {
    is: false,
    shallow: false,
    should: undefined as (value: any, prev?: any) => any,
    nodes: [] as {
        node: ProxyValue;
        shallow?: boolean;
        shouldRender?: (value: any, prev?: any) => any;
        value: any;
    }[],
};
export function updateTracking(node: ProxyValue, value: any) {
    tracking.nodes.push({
        node,
        shallow: tracking.shallow,
        shouldRender: tracking.should,
        value,
    });
}
