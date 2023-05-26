import { NodeValue, optimized, tracking, TrackingNode } from '@legendapp/state';
import { getNodePath } from './traceHelpers';

export function useTraceListeners(name?: string) {
    if (process.env.NODE_ENV === 'development' && tracking.current) {
        tracking.current.traceListeners = traceNodes.bind(this, name);
    }
}

function traceNodes(name: string, nodes: Map<NodeValue, TrackingNode>) {
    if (process.env.NODE_ENV === 'development' && tracking.current) {
        tracking.current.traceListeners = undefined;
        const arr: string[] = [];
        if (nodes) {
            for (const tracked of nodes.values()) {
                const { node, track } = tracked;
                const shallow = track === true;
                const isOptimized = track === optimized;
                arr.push(
                    `${arr.length + 1}: ${getNodePath(node)}${shallow ? ' (shallow)' : ''}${
                        isOptimized ? ' (optimized)' : ''
                    }`
                );
            }
        }

        console.log(
            `[legend-state] ${name ? name + ' ' : ''}tracking ${arr.length} observable${
                arr.length !== 1 ? 's' : ''
            }:\n${arr.join('\n')}`
        );
    }
}
