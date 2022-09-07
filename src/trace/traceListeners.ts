import { tracking, TrackingNode } from '@legendapp/state';
import { getNodePath } from './traceHelpers';

export function traceListeners(name?: string) {
    tracking.listeners = traceNodes.bind(this, name);
}

function traceNodes(name: string, nodes: Map<number, TrackingNode>) {
    tracking.listeners = undefined;
    const arr: string[] = [];
    for (let tracked of nodes.values()) {
        const { node, track: shallow } = tracked;
        arr.push(`${arr.length + 1}: ${getNodePath(node)}${shallow ? ' (shallow)' : ''}`);
    }

    console.log(
        `[legend-state] ${name ? name + ' ' : ''}tracking ${arr.length} observable${
            arr.length > 1 ? 's' : ''
        }:\n${arr.join('\n')}`
    );
}
