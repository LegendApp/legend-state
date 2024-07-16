import type { NodeInfo, TrackingState, TrackingType } from './observableInterfaces';

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

export function updateTracking(node: NodeInfo, track?: TrackingType) {
    if (trackCount) {
        const tracker = tracking.current;
        if (tracker) {
            if (!tracker.nodes) {
                tracker.nodes = new Map();
            }

            const existing = tracker.nodes.get(node);
            if (existing) {
                existing.track = existing.track || track;
                existing.num++;
            } else {
                tracker.nodes.set(node, { node, track, num: 1 });
            }
        }
    }
}
