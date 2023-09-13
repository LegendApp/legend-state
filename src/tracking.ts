import type { NodeValue, TrackingNode } from './observableInterfaces';

interface TrackingState {
    nodes?: Map<NodeValue, TrackingNode>;
    traceListeners?: (nodes: Map<NodeValue, TrackingNode>) => void;
    traceUpdates?: (fn: Function) => Function;
}

let trackCount = 0;
const trackingQueue: (TrackingState | undefined)[] = [];

export const tracking = {
    current: undefined as TrackingState | undefined,
};

export function beginTracking() {
    // Keep a copy of the previous tracking context so it can be restored
    // when this context is complete
    trackingQueue.push(tracking.current);
    trackCount++;
    tracking.current = {};
}
export function endTracking() {
    // Restore the previous tracking context
    trackCount--;
    if (trackCount < 0) {
        trackCount = 0;
    }
    tracking.current = trackingQueue.pop();
}

export function updateTracking(node: NodeValue, shallow?: boolean) {
    if (trackCount) {
        const tracker = tracking.current;
        if (tracker) {
            if (!tracker.nodes) {
                tracker.nodes = new Map();
            }

            const existing = tracker.nodes.get(node);
            if (existing) {
                existing.shallow = existing.shallow || shallow;
                existing.num++;
            } else {
                tracker.nodes.set(node, { node, shallow, num: 1 });
            }
        }
    }
}
