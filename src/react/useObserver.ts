import { ObservableListenerDispose, onChange, onChangeShallow, tracking, TrackingNode } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export function useObserver<T>(fn: () => T, updateFn: () => void) {
    const refFirstListeners = useRef(undefined);
    // Cache previous tracking nodes since this might be nested from another observing component
    const trackingPrev = tracking.nodes;

    // Reset tracking nodes
    tracking.nodes = new Map();

    let nodes: Map<number, TrackingNode>;

    // Create the listener effect before calling fn so that it gets called before
    // effects in the component
    const effect = () => {
        // If we have pre-mount listeners, don't need to update again
        if (refFirstListeners.current) {
            const fn = refFirstListeners.current;
            refFirstListeners.current = null;
            return fn;
        } else {
            const listeners: ObservableListenerDispose[] = [];

            // Listen to tracked nodes
            for (let tracked of nodes) {
                const { node, shallow } = tracked[1];

                listeners.push(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
            }

            // Cleanup listeners
            return () => {
                for (let i = 0; i < listeners.length; i++) {
                    listeners[i]();
                }
            };
        }
    };
    useEffect(effect);

    // Calling the function fills up the tracking nodes
    const ret = fn();

    nodes = tracking.nodes;

    // Call the effect immediately to set up listeners without waiting for mount
    if (refFirstListeners.current === undefined) {
        refFirstListeners.current = effect();
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

    return ret;
}
