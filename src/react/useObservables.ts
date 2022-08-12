import {
    getObservableRawValue,
    isArray,
    isObject,
    isPrimitive,
    onChange,
    onChangeShallow,
    symbolIsObservable,
    symbolShallow,
    tracking,
} from '@legendapp/state';
import { RefObject, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
    ListenerFn,
    MappedObservableValue,
    ObservableListenerDispose,
    ObservableTypeRender,
    TrackingNode,
} from '../observableInterfaces';

function useForceRender() {
    const [, forceRender] = useReducer((s) => s + 1, 0);
    return () => forceRender();
}

interface SavedRef<T extends ObservableTypeRender | Record<string, ObservableTypeRender> | ObservableTypeRender[]> {
    fn: () => T;
    value: T;
    listeners: Set<ObservableListenerDispose>;
    isFirst: boolean;
}

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 * @param deps If present, useObservables will re-activate if the values in the list change. By default it will never reactivate, which is the same as a [] argument.

 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables<
    T extends ObservableTypeRender | Record<string, ObservableTypeRender> | ObservableTypeRender[]
>(fn: () => T, deps?: any[]): MappedObservableValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef<T>>({ fn, isFirst: true, value: undefined, listeners: new Set() });
    ref.current.fn = fn;

    useMemo(() => setup(ref, forceRender), deps || []);

    useEffect(() => () => ref.current.listeners.forEach((dispose) => dispose()), []);

    return ref.current.value as MappedObservableValue<T>;
}

function setup(ref: RefObject<SavedRef<any>>, forceRender: () => void) {
    // Clear out previous listeners before computing new ones
    if (ref.current.listeners.size > 0) {
        ref.current.listeners.forEach((dispose) => dispose());
        ref.current.listeners.clear();
    }

    let previousPrimitives: string;
    const updateFromSelector = () => {
        // Compute returns a string concatenated with all of the primitive values in the arguments
        // so we can easily compare that to the previous result and re-render only if it's different.
        const args = ref.current.fn();
        const { primitives, value } = compute(args);
        if (previousPrimitives !== primitives) {
            previousPrimitives = primitives;
            ref.current.value = value;
            forceRender();
        }
    };
    const updateListeners = (nodes: TrackingNode[], updateFn: ListenerFn) => {
        for (let i = 0; i < nodes.length; i++) {
            const { node, shallow } = nodes[i];

            // Listen to this path if not already listening
            if (!node.listeners?.has(updateFn)) {
                ref.current.listeners.add(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
            }
        }
    };
    const update = () => {
        tracking.nodes = [];

        // tracking.nodes is updated any time a primitive is accessed or get() is called
        // so after calling fn(), tracking.nodes will be filled with those selectors
        const args = ref.current.fn();
        const selectorNodes = tracking.nodes;

        tracking.nodes = [];

        // compute calls symbolGet on all of the observable arguments so afterwards
        // tracking.nodes will be filled with all of the observables in the arguments
        const { primitives, value } = compute(args);

        // Set up listeners on all nodes
        // Selectors only need to check for changes in the primitives while
        // observables need to check observable arguments to add listeners to any
        // that weren't there before
        updateListeners(selectorNodes, updateFromSelector);
        updateListeners(tracking.nodes, update);

        tracking.nodes = undefined;

        ref.current.value = value;

        // Re-render when called by a change handler
        if (!ref.current.isFirst) {
            previousPrimitives = primitives;
            forceRender();
        }
        ref.current.isFirst = false;
    };
    update();
}

function compute(args) {
    let value;
    let primitives: string = '';

    if (args !== undefined && args !== null) {
        let isPrim;
        if (isArray(args)) {
            // Process arguments as an array
            value = [];
            for (let i = 0; i < args.length; i++) {
                isPrim = isPrimitive(args[i]);
                if (isPrim) primitives += args[i];
                value[i] = isPrim ? args[i] : getObservableRawValue(args[i]);
            }
        } else {
            isPrim = isPrimitive(args);
            if (isPrim || args[symbolIsObservable] || args[symbolShallow]) {
                // Process a single value
                if (isPrim) primitives += args;
                value = isPrim ? args : getObservableRawValue(args as ObservableTypeRender);
            } else if (isObject(args)) {
                // Process a flat object of observables
                value = {};
                const keys = Object.keys(args);
                const length = keys.length;
                for (let i = 0; i < length; i++) {
                    const key = keys[i];
                    isPrim = isPrimitive(args[key]);
                    if (isPrim) primitives += args[key];
                    value[key] = isPrim ? args[key] : getObservableRawValue(args[key]);
                }
            }
        }
    }

    return { value: value, primitives };
}
