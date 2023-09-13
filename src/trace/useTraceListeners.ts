import { NodeValue, tracking, TrackingNode } from '@legendapp/state';
import { getNodePath } from './traceHelpers';

export function useTraceListeners(this: any, name?: string) {
    if (process.env.NODE_ENV === 'development' && tracking.current) {
        tracking.current.traceListeners = traceNodes.bind(this, name);
    }
}

function traceNodes(name: string | undefined, nodes: Map<NodeValue, TrackingNode>) {
    if (process.env.NODE_ENV === 'development' && tracking.current) {
        tracking.current.traceListeners = undefined;
        const arr: string[] = [];
        if (nodes) {
            for (const tracked of nodes.values()) {
                const { node, shallow } = tracked;
                arr.push(`${arr.length + 1}: ${getNodePath(node)}${shallow ? ' (shallow)' : ''}`);
            }
        }

        console.log(
            `[legend-state] ${name ? name + ' ' : ''}tracking ${arr.length} observable${
                arr.length !== 1 ? 's' : ''
            }:\n${arr.join('\n')}`,
        );
    }
}
