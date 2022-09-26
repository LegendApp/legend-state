import { NodeValue, tracking } from '@legendapp/state';
import { getNodePath } from './traceHelpers';

export function traceUpdates(name?: string) {
    if (process.env.NODE_ENV === 'development') {
        tracking.current.traceUpdates = replaceUpdateFn.bind(this, name);
    }
}

function replaceUpdateFn(name: string, updateFn: () => void) {
    return onChange.bind(this, name, updateFn);
}

function onChange(
    name: string,
    updateFn: () => void,
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
