import { Tracking } from './globals';
import { ListenerOptions, TrackingNode } from './observableInterfaces';
import { onChange } from './onChange';
import { tracking } from './tracking';

export function setupTracking(nodes: Map<number, TrackingNode>, update: () => void) {
    let listeners = [];
    // Listen to tracked nodes
    for (let tracked of nodes.values()) {
        const { node, track } = tracked;
        let options: ListenerOptions;
        if (track) {
            options = {
                shallow: track === Tracking.shallow,
                optimized: track === Tracking.optimized,
            };
        }
        listeners.push(onChange(node, update, options));
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

export function effect(run: () => void | (() => void)) {
    let cleanup: () => void;
    // Wrap it in a function so it doesn't pass all the arguments to run()
    let update = function () {
        if (cleanup) {
            cleanup();
            cleanup = undefined;
        }
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
    };

    const trackingPrev = tracking.nodes;
    tracking.nodes = new Map();

    update();

    // Do tracing if it was requested
    if (process.env.NODE_ENV === 'development') {
        tracking.listeners?.(tracking.nodes);
        if (tracking.updates) {
            update = tracking.updates(update);
        }
    }

    const ret = setupTracking(tracking.nodes, update);

    tracking.nodes = trackingPrev;

    return ret;
}
