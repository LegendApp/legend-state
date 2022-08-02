import { useEffect, useReducer, useRef } from 'react';
import { getObservableRawValue } from '../globals';
import { ObservableChecker, ObservableListener } from '../observableInterfaces';
import { onChange, onChangeShallow } from '../on';
import state from '../state';

function useForceRender() {
    const [, forceRender] = useReducer((s) => s + 1, 0);
    return forceRender as () => void;
}

interface SavedRef {
    listeners: Map<string, ObservableListener>;
    cmpValue?: Map<string, any>;
}

const pathsSeen = new Set();
/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables<T extends ObservableChecker[]>(...args: T): T {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: new Map(),
        };
    }

    // Start tracking to fill trackedNodes with all nodes accessed
    const ret = [];
    state.isTracking = true;
    state.trackedNodes = [];

    for (let i = 0; i < args.length; i++) {
        ret[i] = getObservableRawValue(args[i]);
    }

    state.isTracking = false;

    pathsSeen.clear();

    const listeners = ref.current.listeners;
    for (let tracked of state.trackedNodes) {
        const { node, equalityFn, shallow } = tracked;
        const path = node.path;
        // Track the paths seen this frame to dispose of listeners no longer needed
        pathsSeen.add(path);

        // Listen to this path if not already listening
        if (!listeners.has(path)) {
            let cb = forceRender as (value?: any) => void;
            // If using an equality function, only render when the return value of equalityFn changes
            if (equalityFn) {
                if (!ref.current.cmpValue) {
                    ref.current.cmpValue = new Map();
                }
                ref.current.cmpValue.set(path, equalityFn(tracked.value));
                cb = (v) => {
                    const cmpValue = equalityFn(v);
                    if (cmpValue !== ref.current.cmpValue.get(path)) {
                        ref.current.cmpValue.set(path, cmpValue);
                        forceRender();
                    }
                };
            }
            listeners.set(path, shallow ? onChangeShallow(node, cb) : onChange(node, cb));
        }
    }

    // Dispose any listeners not seen in this frame
    // TODO Faster way to do this than forEach?
    listeners.forEach((listener, listenerPath) => {
        if (!pathsSeen.has(listenerPath)) {
            listener.dispose();
            listeners.delete(listenerPath);
        }
    });

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            const listeners = ref.current.listeners;
            if (listeners) {
                listeners.forEach((listener) => listener.dispose());
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    return ret as T;
}
