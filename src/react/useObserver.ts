import { ObservableListenerDispose, onChange, tracking, ListenerOptions, Tracking } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export function useObserver<T>(fn: () => T, updateFn: () => void) {
    const refListeners = useRef<ObservableListenerDispose[]>([]);
    const listeners = refListeners.current;

    // Cleanup old listeners before tracking
    if (listeners.length > 0) {
        cleanup(listeners);
    }

    // Cache previous tracking nodes since this might be nested from another observing component
    const trackingPrev = tracking.nodes;

    // Reset tracking nodes
    tracking.nodes = new Map();

    // Calling the function fills up the tracking nodes
    const ret = fn();

    const nodes = tracking.nodes;

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
        listeners.push(onChange(node, updateFn, options));
    }

    // Do tracing if it was requested
    if (process.env.NODE_ENV === 'development') {
        tracking.listeners?.(nodes);
        if (tracking.updates) {
            updateFn = tracking.updates(updateFn);
        }
    }

    // Restore previous tracking nodes
    tracking.nodes = trackingPrev;

    // Cleanup listeners on unmounts
    useEffect(() => {
        let listeners = refListeners.current;
        // Workaround for React 18's double calling useEffect. If this is the
        // second useEffect, set up listeners again.
        if (process.env.NODE_ENV === 'development' && refListeners.current === undefined) {
            listeners = refListeners.current = [];
            // Re-listen to tracked nodes. This should be copied from above.
            for (let tracked of nodes.values()) {
                const { node, track } = tracked;

                let options: ListenerOptions;
                if (track) {
                    options = {
                        shallow: track === Tracking.shallow,
                        optimized: track === Tracking.optimized,
                    };
                }

                listeners.push(onChange(node, updateFn, options));
            }
        }
        return () => {
            cleanup(listeners);
            // Set it to undefined so it would trigger the above React 18 workaround
            refListeners.current = undefined;
        };
    }, []);

    return ret;
}

function cleanup(listeners: ObservableListenerDispose[]) {
    // Cleanup listeners
    for (let i = 0; i < listeners.length; i++) {
        listeners[i]();
    }
    listeners.length = 0;
}
