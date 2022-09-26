import type { NodeValue, TrackingNode, TrackingType } from './observableInterfaces';

interface TrackingState {
    nodes?: Map<number, TrackingNode>;
    traceListeners?: (nodes: Map<number, TrackingNode>) => void;
    traceUpdates?: (fn: () => void) => () => void;
}
let lastNode: NodeValue;

let trackCount = 0;

export const tracking = {
    current: undefined as TrackingState,
};

export function beginTracking() {
    // Keep a copy of the previous tracking context so it can be restored
    // when this context is complete
    const prev = tracking.current;
    trackCount++;
    tracking.current = {};
    return prev;
}
export function endTracking(prevState: TrackingState) {
    // Restore the previous tracking context
    trackCount--;
    if (trackCount < 0) {
        trackCount = 0;
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            // Shouldn't be possible, but leave as a sanity check
            debugger;
        }
    }
    tracking.current = prevState;
}

export function updateTracking(node: NodeValue, track?: TrackingType) {
    if (trackCount) {
        const tracker = tracking.current;
        if (!tracker.nodes) {
            tracker.nodes = new Map();
        }

        lastNode = node;
        const existing = tracker.nodes.get(node.id);
        if (existing) {
            existing.track = existing.track || track;
            existing.num++;
        } else {
            tracker.nodes.set(node.id, { node, track, num: 1 });
        }
    }
}

export function untrack(node: NodeValue) {
    const tracker = tracking.current;
    if (tracker) {
        const tracked = tracker.nodes.get(node.id);
        if (tracked) {
            if (tracked.num === 1) {
                tracker.nodes.delete(node.id);
            } else {
                tracked.num--;
            }
        }
    }
}
