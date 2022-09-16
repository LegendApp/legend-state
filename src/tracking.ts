import type { NodeValue, TrackingNode } from './observableInterfaces';

let lastNode: NodeValue;

export const tracking = {
    isTracking: false,
    nodes: undefined as Map<number, TrackingNode>,
    listeners: undefined as (nodes: Map<number, TrackingNode>) => void,
    updates: undefined as (fn: () => void) => () => void,
    callbacksMarked: new Set<() => void>(),
};

export function beginTracking() {
    // Keep a copy of the previous tracking context so it can be restored
    // when this context is complete
    const prev = tracking.nodes;
    tracking.isTracking = true;
    tracking.nodes = undefined;
    return prev;
}
export function endTracking(prevNodes: Map<number, TrackingNode>) {
    // Restore the previous tracking context
    tracking.isTracking = !!prevNodes;
    tracking.nodes = prevNodes;
}

export function updateTracking(node: NodeValue, track?: boolean | Symbol) {
    if (tracking.isTracking) {
        if (!tracking.nodes) {
            tracking.nodes = new Map();
        }
        lastNode = node;
        const existing = tracking.nodes.get(node.id);
        if (existing) {
            existing.track = existing.track || track;
            existing.num++;
        } else {
            tracking.nodes.set(node.id, { node, track, num: 1 });
        }
    }
}

export function untrack(node: NodeValue) {
    if (tracking.nodes) {
        const tracked = tracking.nodes.get(node.id);
        if (tracked) {
            if (tracked.num === 1) {
                tracking.nodes.delete(node.id);
            } else {
                tracked.num--;
            }
        }
    }
}

export function checkTracking(node: NodeValue, track: boolean | Symbol) {
    if (tracking.isTracking) {
        if (track) {
            updateTracking(node, track);
        } else {
            untrack(node);
        }
    }
}

let timeoutSweep;
export function scheduleSweep() {
    if (timeoutSweep) {
        clearTimeout(timeoutSweep);
    }
    timeoutSweep = setTimeout(sweep, 0);
}

export function sweep() {
    timeoutSweep = undefined;
    if (tracking.callbacksMarked.size) console.log('sweeping');
    for (let marked of tracking.callbacksMarked) {
        marked();
    }
    tracking.callbacksMarked.clear();
}
