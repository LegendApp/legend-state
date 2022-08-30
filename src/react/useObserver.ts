import { ObservableListenerDispose, onChange, onChangeShallow, tracking, TrackingNode } from '@legendapp/state';
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
    tracking.nodes = {};

    // Calling the function fills up the tracking nodes
    const ret = fn();

    const nodes = tracking.nodes as Record<number, TrackingNode>;

    // Listen to tracked nodes
    const keys = Object.keys(nodes);
    for (let i = 0; i < keys.length; i++) {
        const { node, shallow } = tracking.nodes[keys[i] as unknown as number];
        listeners.push(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
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
            // Re-listen to tracked nodes
            const keys = Object.keys(nodes);
            for (let i = 0; i < keys.length; i++) {
                const { node, shallow } = tracking.nodes[keys[i] as unknown as number];
                // for (let tracked of nodes) {
                listeners.push(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
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
