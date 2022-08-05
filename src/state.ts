import type { ProxyValue } from './observableInterfaces';

export const tracking = {
    is: false,
    shallow: false,
    should: undefined as (value: any, prev?: any) => any,
};
export const trackedNodes = [] as {
    node: ProxyValue;
    shallow?: boolean;
    shouldRender?: (value: any, prev?: any) => any;
    value: any;
}[];
export function updateTracking(node: ProxyValue, value: any) {
    trackedNodes.push({
        node,
        shallow: tracking.shallow,
        shouldRender: tracking.should,
        value,
    });
}
