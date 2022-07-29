import { isArray, isObject } from '@legendapp/tools';
import { useForceRender, useStableCallback } from '@legendapp/tools/react';
import { RefObject, useCallback, useEffect, useRef } from 'react';
import { ObservableListener3 } from '../observable3';
import { symbolProp, symbolShallow, symbolEqualityFn } from '../globals';
import {
    EqualityFn,
    Observable,
    Observable2,
    ObservableListener,
    ObservableListenerInfo2,
    Shallow,
} from '../observableInterfaces';

interface SavedRef {
    listeners: ObservableListener3[];
    cmpValue?: any[];
}

function getRawValue(obs: Observable) {
    const prop = obs[symbolProp as any];
    if (prop) {
        return prop.value;
    } else {
        const eq = obs[symbolEqualityFn as any];
        if (eq) {
            return getRawValue(eq.obs);
        } else {
            return obs[symbolShallow as any] || obs;
        }
    }
}

type ObservableChecker<T> = Shallow | EqualityFn | Observable2;
// type ObservableChecker<T> = T extends Shallow<infer t> ? Observable2<t> : Observable2<T>;

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables3<
    T extends ObservableChecker<T> | ObservableChecker<T>[] | Record<string, ObservableChecker<T>>
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
    return args.map(getRawValue);
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
            const listener = obs._on(
                shallow ? 'changeShallow' : 'change',
                comparator || onChange
            ) as unknown as ObservableListener;
            // @ts-ignore
            saved.listeners[i] = listener;
        }
    }
}
