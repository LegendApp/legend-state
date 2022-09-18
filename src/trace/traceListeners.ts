import { tracking, TrackingNode, Tracking } from '@legendapp/state';
import { getNodePath } from './traceHelpers';

export function traceListeners(name?: string) {
    tracking.listeners = traceNodes.bind(this, name);
}

function traceNodes(name: string, nodes: Map<number, TrackingNode>) {
    tracking.listeners = undefined;
    const arr: string[] = [];
    if (nodes) {
        for (let tracked of nodes.values()) {
            const { node, track } = tracked;
            const shallow = track === Tracking.shallow;
            const optimized = track === Tracking.optimized;
            arr.push(
                `${arr.length + 1}: ${getNodePath(node)}${shallow ? ' (shallow)' : ''}${
                    optimized ? ' (optimized)' : ''
                }`
            );
        }
    } else if (process.env.NODE_ENV === 'development') {
        // Shouldn't be possible, but leave as a sanity check
        debugger;
    }

    console.log(
        `[legend-state] ${name ? name + ' ' : ''}tracking ${arr.length} observable${
            arr.length > 1 ? 's' : ''
        }:\n${arr.join('\n')}`
    );
}
