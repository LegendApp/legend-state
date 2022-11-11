import { NodeValue, tracking } from '@legendapp/state';
import { getNodePath } from './traceHelpers';

export function useTraceUpdates(name?: string) {
    if (process.env.NODE_ENV === 'development' && tracking.current) {
        tracking.current.traceUpdates = replaceUpdateFn.bind(undefined, name);
    }
}

function replaceUpdateFn(name: string | undefined, updateFn: Function) {
    return onChange.bind(undefined, name, updateFn);
}

function onChange(
    name: string | undefined,
    updateFn: Function,
    value: any,
    getPrevious: () => any,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any,
    node: NodeValue
) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[legend-state] Rendering ${name ? name + ' ' : ''}because "${getNodePath(node)}" changed:
from: ${JSON.stringify(getPrevious())}
to: ${JSON.stringify(value)}`);
        return updateFn();
    }
}
