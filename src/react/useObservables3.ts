import { isArray, isObject } from '@legendapp/tools';
import { useForceRender } from '@legendapp/tools/react';
import { RefObject, useEffect, useRef, useState } from 'react';
import { getObservableRawValue, symbolEqualityFn, symbolProp, symbolShallow } from '../globals';
import {
    EqualityFn,
    Observable,
    Observable2,
    ObservableChecker3,
    ObservableListener,
    ObservableListener3,
    Shallow,
    ListenerFn3,
} from '../observableInterfaces';

interface SavedRef {
    listeners: ObservableListener3[];
    cmpValue?: any[];
}

export function useObservable3<T extends Observable2>(obs: T, equalityFn?: (state: T) => any) {
    const fr = useForceRender();
    useEffect(() => {
        let cb = fr as ListenerFn3<T>;
        if (equalityFn) {
            let prev = equalityFn(obs);
            cb = (value: T) => {
                const cur = equalityFn(value);
                if (cur !== prev) {
                    prev = cur;
                    fr();
                }
            };
        }
        const listener = obs._.onChange(cb);
        return () => listener.dispose();
    }, []);
    return obs;
}

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables3<
    T extends ObservableChecker3<T> | ObservableChecker3<T>[] | Record<string, ObservableChecker3<T>>
>(args: T): T {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: [],
        };
    }

    const isArr = isArray(args);
    const isObj = !isArr && isObject(args);

    // TODO Object probably doesn't work
    const arr = (isArr ? args : isObj ? Object.values(args) : [args]) as Observable2[];

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            if (ref.current.listeners) {
                ref.current.listeners.forEach((p) => p.dispose());
                ref.current.listeners = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    // Compare to previous args and update listeners if any changed or first mount
    updateListeners(arr as Observable2[], ref, forceRender);

    // TODO Support single obs and object
    return args.map(getObservableRawValue);
}

function updateListeners(arr: Observable2[], refSaved: RefObject<SavedRef>, onChange: () => void) {
    const saved = refSaved.current;
    // Unlisten proxies no longer tracked
    for (let i = 0; i < saved.listeners.length; i++) {
        const p = saved.listeners[i];
        if (!arr[i]) {
            p.dispose();
            saved.listeners[i] = undefined;
        }
    }
    // Listen to all tracked proxies
    for (let i = 0; i < arr.length; i++) {
        let obs = arr[i];
        // Skip arguments that are undefined
        if (obs && !saved.listeners[i]) {
            let shallow = false;
            let comparator = undefined;
            if (obs[symbolShallow as any]) {
                shallow = true;
                obs = obs[symbolShallow as any];
            }
            if (obs[symbolEqualityFn as any]) {
                const o = (obs as unknown as EqualityFn)[symbolEqualityFn];
                obs = o.obs;
                if (saved.cmpValue === undefined) {
                    saved.cmpValue = [];
                }
                saved.cmpValue[i] = o.fn(obs);
                comparator = (value) => {
                    const cmpValue = o.fn(value);
                    if (cmpValue !== refSaved.current.cmpValue[i]) {
                        refSaved.current.cmpValue[i] = cmpValue;
                        onChange();
                    }
                };
            }
            // Listen to the observable and by `changeShallow` if the argument was shallow(...)
            const listener = (shallow ? obs._.onChangeShallow : obs._.onChange)(
                comparator || onChange
            ) as unknown as ObservableListener;
            // @ts-ignore
            saved.listeners[i] = listener;
        }
    }
}
