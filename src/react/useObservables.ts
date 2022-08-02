import { useEffect, useReducer, useRef } from 'react';
import state from '../state';
import { getNodeValue, getObservableRawValue, symbolEqualityFn, symbolGet, symbolShallow } from '../globals';
import { Observable, ObservableChecker, ObservableListener } from '../observableInterfaces';
import { isArray, isObject } from '../is';
import { onChange, onChangeShallow } from '../on';

export function useForceRender() {
    const [, forceRender] = useReducer((s) => s + 1, 0);
    return forceRender as () => void;
}

interface SavedRef {
    listeners: Map<string, ObservableListener>;
    cmpValue?: Map<string, any>;
}

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

    const ret = [];
    state.isTracking = true;
    state.trackedNodes = [];

    for (let i = 0; i < args.length; i++) {
        ret[i] = getObservableRawValue(args[i]);
    }

    state.isTracking = false;

    const listeners = ref.current.listeners;
    for (let tracked of state.trackedNodes) {
        const { node, equalityFn, shallow } = tracked;
        if (!listeners.has(node.path)) {
            let cb = forceRender as (value?: any) => void;
            if (equalityFn) {
                if (!ref.current.cmpValue) {
                    ref.current.cmpValue = new Map();
                }
                ref.current.cmpValue.set(node.path, equalityFn(tracked.value));
                cb = (v) => {
                    const cmpValue = equalityFn(v);
                    ref.current.cmpValue.set(node.path, cmpValue);
                    forceRender();
                };
            }
            listeners.set(node.path, shallow ? onChangeShallow(node, cb) : onChange(node, cb));
        }
    }

    // const saved = ref.current;
    // const listeners = saved.listeners;
    // for (let i = 0; i < args.length; i++) {
    //     let obs = args[i];
    //     if (obs) {
    //         // Listen if not already listening
    //         if (!listeners[i]) {
    //             // Check if this parameter is a shallow
    //             let shallow = false;
    //             // if (obs[symbolShallow]) {
    //             //     shallow = true;
    //             //     obs = obs[symbolShallow];
    //             // }
    //             // // Check if this parameter is an equality function
    //             // let comparator = undefined;
    //             // if (obs[symbolEqualityFn]) {
    //             //     const o = obs[symbolEqualityFn];
    //             //     obs = o.obs;
    //             //     if (saved.cmpValue === undefined) {
    //             //         saved.cmpValue = [];
    //             //     }
    //             //     saved.cmpValue[i] = o.fn(obs);
    //             //     comparator = (value) => {
    //             //         const cmpValue = o.fn(value);
    //             //         if (cmpValue !== ref.current.cmpValue[i]) {
    //             //             ref.current.cmpValue[i] = cmpValue;
    //             //             forceRender();
    //             //         }
    //             //     };
    //             // }
    //             // Listen to the observable, by `changeShallow` if the argument was shallow(...)
    //             const listener = (shallow ? (obs as Observable).onChangeShallow : (obs as Observable).onChange)(
    //                 forceRender
    //             );

    //             listeners[i] = listener;
    //         }
    //     } else if (listeners[i]) {
    //         // This parameter become undefined so dispose the old listener
    //         listeners[i].dispose();
    //         listeners[i] = undefined;
    //     }
    // }

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            // const l = ref.current.listeners;
            // if (listeners) {
            //     for (let i = 0; i < listeners.length; i++) {
            //         listeners[i]?.dispose();
            //     }
            //     ref.current.listeners = [];
            // }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    // For loop is faster than map
    // const ret: any[] = [];
    // for (let i = 0; i < args.length; i++) {
    //     // @ts-ignore
    //     ret.push(args[i][symbolGet]); // getObservableRawValue(args[i] as Observable<any>));
    // }
    // return ret as T;

    return ret as T;
}
