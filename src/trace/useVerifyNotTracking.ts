import { internal, NodeInfo, TrackingNode } from '@legendapp/state';
import { getNodePath } from './traceHelpers';
const { optimized, tracking } = internal;

export function useVerifyNotTracking(this: any, name?: string) {
    if (process.env.NODE_ENV === 'development') {
        tracking.current!.traceListeners = traceNodes.bind(this, name);
    }
}

function traceNodes(name: string | undefined, nodes: Map<NodeInfo, TrackingNode>) {
    if (process.env.NODE_ENV === 'development') {
        tracking.current!.traceListeners = undefined;
        const arr: string[] = [];
        if (nodes) {
            for (const tracked of nodes.values()) {
                const { node, track } = tracked;
                const shallow = track === true;
                const isOptimized = track === optimized;
                arr.push(
                    `${arr.length + 1}: ${getNodePath(node)}${shallow ? ' (shallow)' : ''}${
                        isOptimized ? ' (optimized)' : ''
                    }`,
                );
            }
            console.error(
                `[legend-state] ${name ? name + ' ' : ''}tracking ${arr.length} observable${
                    arr.length !== 1 ? 's' : ''
                } when it should not be:\n${arr.join('\n')}`,
            );
        }
    }
}
