import { ObservableListenerDispose, onChange, onChangeShallow, tracking } from '@legendapp/state';
import { useEffect } from 'react';

export function useObserver<T>(fn: () => T, updateFn: () => void) {
    // Cache previous tracking nodes since this might be nested from another observing component
    const trackingPrev = tracking.nodes;

    // Reset tracking nodes
    tracking.nodes = new Map();

    let nodes;

    // Create the listener effect before calling fn so that it gets called before
    // effects in the component
    useEffect(() => {
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
    });

    // Calling the function fills up the tracking nodes
    const ret = fn();

    nodes = tracking.nodes;

    // Do tracing if it was requested
    if (process.env.NODE_ENV === 'development') {
        tracking.traceListeners?.(nodes);
        if (tracking.traceUpdates) {
            updateFn = tracking.traceUpdates(updateFn);
        }
    }

    // Restore previous tracking nodes
    tracking.nodes = trackingPrev;

    return ret;
}
