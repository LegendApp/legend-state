import {
    getObservableRawValue,
    isArray,
    isObject,
    isPrimitive,
    onChange,
    onChangeShallow,
    symbolIsObservable,
    symbolShallow,
    symbolShouldRender,
    tracking,
} from '@legendapp/state';
import { useEffect, useReducer, useRef } from 'react';
import type {
    MappedObservableValue,
    ObservableCheckerRender,
    ObservableListenerDispose,
    Shallow,
} from '../observableInterfaces';

function useForceRender() {
    const [, forceRender] = useReducer((s) => s + 1, 0);
    return () => forceRender();
}

interface SavedRef {
    listeners: Map<string, ObservableListenerDispose>;
}

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables<
    T extends ObservableCheckerRender | Record<string, ObservableCheckerRender> | ObservableCheckerRender[]
>(fn: () => T): MappedObservableValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: new Map(),
        };
    }

    // Start tracking to fill trackedNodes with all nodes accessed
    let ret;
    tracking.is = true;
    tracking.nodes = [];

    const args = fn();

    if (args !== undefined) {
        if (args[symbolIsObservable]) {
            ret = getObservableRawValue(args as ObservableCheckerRender);
        } else if (args) {
            if (isPrimitive(args)) {
                ret = args;
            } else if (isArray(args)) {
                ret = [];
                for (let i = 0; i < args.length; i++) {
                    ret[i] = getObservableRawValue(args[i]);
                }
            } else if (isObject(args)) {
                if (args[symbolShallow] || args[symbolShouldRender]) {
                    ret = getObservableRawValue(args as Shallow);
                } else {
                    ret = {};
                    const keys = Object.keys(args);
                    const length = keys.length;
                    for (let i = 0; i < length; i++) {
                        const key = keys[i];
                        ret[key] = getObservableRawValue(args[key]);
                    }
                }
            }
        }
    }

    tracking.is = false;

    const listeners = ref.current.listeners;
    for (let tracked of tracking.nodes) {
        const { node, shouldRender, shallow } = tracked;
        const path = node.path;
        // Track the paths seen this frame to dispose of listeners no longer needed

        // Listen to this path if not already listening
        if (!listeners.has(path)) {
            let cb = forceRender as (value?: any, prev?: any) => void;
            // If using shouldRender, only render when the return value of shouldRender changes
            if (shouldRender) {
                cb = (v, getPrev: () => any) => {
                    const prev = getPrev();
                    if (shouldRender(v, prev)) {
                        forceRender();
                    }
                };
            }
            listeners.set(path, shallow ? onChangeShallow(node, cb) : onChange(node, cb));
        }
    }

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            ref.current.listeners.forEach((listener) => listener());
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    return ret as MappedObservableValue<T>;
}
