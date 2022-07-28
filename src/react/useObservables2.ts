import { isArray, isObject } from '@legendapp/tools';
import { useForceRender, useStableCallback } from '@legendapp/tools/react';
import { useEffect, useRef } from 'react';
import { isObservable, isObservableEvent } from '../observableFns';
import { symbolShallow } from '../globals';
import {
    MappedObservableValue,
    Observable,
    Observable2,
    ObservableEvent,
    ObservableListener,
    ObservableValue,
    Shallow,
} from '../observableInterfaces';

interface SavedRef {
    proxies: [Observable2, ObservableListener][];
    cmpValue: any;
}

// function getRawValue<T extends ObservableChecker | ObservableEvent>(obs: T): ObservableValue<T> {
//     return obs && (isObservableEvent(obs) ? undefined : isObservable(obs) ? obs.get() : obs);
// }

const undef = Symbol();

type ObservableChecker<T> = Shallow | Observable2;
// type ObservableChecker<T> = T extends Shallow<infer t> ? Observable2<t> : Observable2<T>;

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables2<
    T extends ObservableChecker<T> | ObservableChecker<T>[] | Record<string, ObservableChecker<T>>
>(args: T, renderComparator?: () => any): T {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            proxies: [],
            cmpValue: undef,
        };
    }

    const isArr = isArray(args);
    const isObj = !isArr && isObject(args);

    // TODO Object probably doesn't work
    const arr = (isArr ? args : isObj ? Object.values(args) : [args]) as Observable2[];

    const onChange = useStableCallback(() => {
        if (!renderComparator) {
            return forceRender();
        }
        const val = renderComparator();
        if (val !== ref.current.cmpValue) {
            ref.current.cmpValue = val;
            forceRender();
        }
    });

    // Compare to previous args and update listeners if any changed or first mount
    updateListeners(arr as Observable2[], ref.current, onChange);

    if (renderComparator && ref.current.cmpValue === undef) {
        ref.current.cmpValue = renderComparator();
    }

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            if (ref.current.proxies) {
                ref.current.proxies.forEach((p) => p[1].dispose());
                ref.current.proxies = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    return args.map((obs) => obs[symbolShallow] || obs);
}

function updateListeners(arr: Observable2[], saved: SavedRef, onChange: () => void) {
    // Unlisten proxies no longer tracked
    for (let i = 0; i < saved.proxies.length; i++) {
        const p = saved.proxies[i];
        if (!arr[i]) {
            p[1].dispose();
            saved.proxies[i] = undefined;
        }
    }
    // Listen to all tracked proxies
    for (let i = 0; i < arr.length; i++) {
        let obs = arr[i];
        // Skip arguments that are undefined
        if (obs && !saved.proxies[i]) {
            // TODO SHALLOW
            let shallow = false;
            if (obs[symbolShallow as any]) {
                shallow = true;
                obs = obs[symbolShallow as any];
            }
            // Listen to the observable and by `changeShallow` if the argument was shallow(...)
            const listener = obs._on(shallow ? 'changeShallow' : 'change', onChange) as ObservableListener;
            saved.proxies.push([obs, listener]);
        }
    }
}
