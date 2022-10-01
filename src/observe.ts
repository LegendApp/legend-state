import { beginBatch, endBatch } from './batching';
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

        // Wrap run() in a batch so changes don't happen until we're done tracking here
        beginBatch();

        beginTracking();

        cleanup = run() as () => void;

        const tracker = tracking.current;
        // Do tracing if it was requested
        if (process.env.NODE_ENV === 'development') {
            tracker.traceListeners?.(tracker.nodes);
            if (tracker.traceUpdates) {
                update = tracker.traceUpdates(update);
            }
            // Clear tracing
            tracker.traceListeners = undefined;
            tracker.traceUpdates = undefined;
        }

        dispose = setupTracking(tracker.nodes, update, /*noArgs*/ true);

        endTracking();

        endBatch();
    };

    update();

    return dispose;
}
