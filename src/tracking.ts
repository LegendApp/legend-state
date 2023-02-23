import type { NodeValue, TrackingNode, TrackingType } from './observableInterfaces';

interface TrackingState {
    nodes?: Map<number, TrackingNode>;
    traceListeners?: (nodes: Map<number, TrackingNode>) => void;
    // eslint-disable-next-line @typescript-eslint/ban-types
    traceUpdates?: (fn: Function) => Function;
}

let trackCount = 0;
const trackingQueue: (TrackingState | undefined)[] = [];

export const tracking = {
    current: undefined as TrackingState | undefined,
    inRemoteChange: false,
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

export function updateTracking(node: NodeValue, track?: TrackingType) {
    if (trackCount) {
        const tracker = tracking.current;
        if (tracker) {
            if (!tracker.nodes) {
                tracker.nodes = new Map();
            }

            const existing = tracker.nodes.get(node.id);
            if (existing) {
                existing.track = existing.track || track;
                existing.num++;
            } else {
                tracker.nodes.set(node.id, { node, track, num: 1 });
            }
        }
    }
}
