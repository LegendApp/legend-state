import { isFunction } from './is';
import { TrackingNode } from './observableInterfaces';
import { onChange } from './onChange';
import { beginTracking, endTracking, tracking } from './tracking';

export function setupTracking(nodes: Map<number, TrackingNode>, update: () => void, noArgs?: boolean) {
    let listeners = [];
    // Listen to tracked nodes
    if (nodes) {
        for (let tracked of nodes.values()) {
            const { node, track } = tracked;
            listeners.push(onChange(node, update, track, noArgs));
        }
    }

    return () => {
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                listeners[i]();
            }
            listeners = undefined;
        }
    };
}

export function observe(run: () => void | (() => void)) {
    let cleanup: () => void;
    let dispose: () => void;
    // Wrap it in a function so it doesn't pass all the arguments to run()
    let update = function () {
        if (isFunction(cleanup)) {
            cleanup();
        }

        dispose?.();

        const trackingPrev = beginTracking();

        cleanup = run() as () => void;

        // Do tracing if it was requested
        if (process.env.NODE_ENV === 'development') {
            tracking.listeners?.(tracking.nodes);
            if (tracking.updates) {
                update = tracking.updates(update);
            }
            // Clear tracing
            tracking.listeners = undefined;
            tracking.updates = undefined;
        }

        dispose = setupTracking(tracking.nodes, update, /*noArgs*/ true);

        endTracking(trackingPrev);
    };

    update();

    // Do tracing if it was requested
    if (process.env.NODE_ENV === 'development') {
        tracking.listeners?.(tracking.nodes);
        if (tracking.updates) {
            update = tracking.updates(update);
        }
    }

    return () => dispose();
}
