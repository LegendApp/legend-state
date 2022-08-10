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

// function arrayEqual(arr1: any[], arr2: any[]) {
//     if (!arr1 || !arr2 || arr1.length !== arr2.length) return false;

//     for (let i = 0; i < arr1.length; i++) {
//         if (arr1[i] !== arr2[i]) return false;
//     }

//     return true;
// }

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
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
    if (ref.current.listeners.size > 0) {
        ref.current.listeners.forEach((dispose) => dispose());
        ref.current.listeners.clear();
    }

    let previousPrimitives: string;
    const updateFromSelector = () => {
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
            // const path = node.path;

            // Listen to this path if not already listening
            if (!node.listeners?.has(updateFn)) {
                ref.current.listeners.add(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
            }
        }
    };
    const update = () => {
        tracking.is = true;
        tracking.nodes = [];

        const args = ref.current.fn();
        const selectorNodes = tracking.nodes;

        tracking.nodes = [];

        const { primitives, value } = compute(args);

        tracking.is = false;
        updateListeners(selectorNodes, updateFromSelector);
        updateListeners(tracking.nodes, update);

        ref.current.value = value;

        if (!ref.current.isFirst) {
            previousPrimitives = primitives;
            forceRender();
        }
        ref.current.isFirst = false;
    };
    update();
}

function compute(args) {
    let ret;
    let primitives: string = '';

    if (args !== undefined && args !== null) {
        let isPrim;
        if (isArray(args)) {
            ret = [];
            for (let i = 0; i < args.length; i++) {
                isPrim = isPrimitive(args[i]);
                if (isPrim) primitives += args[i];
                ret[i] = isPrim ? args[i] : getObservableRawValue(args[i]);
            }
        } else {
            isPrim = isPrimitive(args);
            if (isPrim || args[symbolIsObservable] || args[symbolShallow]) {
                if (isPrim) primitives += args;

                ret = isPrim ? args : getObservableRawValue(args as ObservableTypeRender);
            } else if (isObject(args)) {
                ret = {};
                const keys = Object.keys(args);
                const length = keys.length;
                for (let i = 0; i < length; i++) {
                    const key = keys[i];
                    isPrim = isPrimitive(args[key]);
                    if (isPrim) primitives += args[key];
                    ret[key] = isPrim ? args[key] : getObservableRawValue(args[key]);
                }
            }
        }
    }

    return { value: ret, primitives };
}
