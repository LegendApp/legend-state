import { ObservableListenerDispose, onChange, onChangeShallow, tracking } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export function useObserver<T>(fn: () => T, updateFn: () => void) {
    const listeners = useRef<ObservableListenerDispose[]>([]).current;

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
    for (let tracked of nodes) {
        const { node, shallow } = tracked[1];

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
    useEffect(() => () => cleanup(listeners), []);

    return ret;
}

function cleanup(listeners: ObservableListenerDispose[]) {
    // Cleanup listeners
    for (let i = 0; i < listeners.length; i++) {
        listeners[i]();
    }
    listeners.length = 0;
}
