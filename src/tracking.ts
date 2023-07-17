import type { NodeValue, TrackingNode, TrackingType } from './observableInterfaces';

interface TrackingState {
    nodes?: Map<NodeValue, TrackingNode>;
    traceListeners?: (nodes: Map<NodeValue, TrackingNode>) => void;
    traceUpdates?: (fn: Function) => Function;
}

let trackCount = 0;
const trackingQueue: (TrackingState | undefined)[] = [];

export const tracking = {
    current: undefined as TrackingState | undefined,
    inRemoteChange: false,
    inRender: false,
};

export function beginTracking(inRender?: boolean) {
    // Keep a copy of the previous tracking context so it can be restored
    // when this context is complete
    trackingQueue.push(tracking.current);
    trackCount++;
    tracking.inRender = inRender;
    tracking.current = {};
}
export function endTracking(fromRender?: boolean) {
    // Restore the previous tracking context
    trackCount--;
    if (trackCount < 0) {
        trackCount = 0;
    }
    if (fromRender) {
        tracking.inRender = false;
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
