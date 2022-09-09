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
    const update = function () {
        if (cleanup) {
            cleanup();
            cleanup = undefined;
        }
        cleanup = run() as () => void;
    };

    const trackingPrev = tracking.nodes;
    tracking.nodes = new Map();

    cleanup = run() as () => void;

    const ret = setupTracking(tracking.nodes, update);

    tracking.nodes = trackingPrev;

    return ret;
}
