import { isArray, isObject } from '@legendapp/tools';
import { useForceRender, useStableCallback } from '@legendapp/tools/react';
import { useEffect, useRef } from 'react';
import { symbolProp, symbolShallow } from '../globals';
import { Observable, Observable2, ObservableListener, Shallow } from '../observableInterfaces';

interface SavedRef {
    proxies: [Observable2, ObservableListener][];
    cmpValue: any;
}

function getRawValue(obs: Observable) {
    const prop = obs[symbolProp as any];
    if (prop) {
        return prop.node.value[prop.key];
    } else {
        return obs[symbolShallow as any] || obs;
    }
}

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

    const onChange = renderComparator
        ? useStableCallback(() => {
              const val = renderComparator();
              if (val !== ref.current.cmpValue) {
                  ref.current.cmpValue = val;
                  forceRender();
              }
          })
        : useForceRender();

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

    // TODO Support single obs and object
    return args.map(getRawValue);
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
            let shallow = false;
            if (obs[symbolShallow as any]) {
                shallow = true;
                obs = obs[symbolShallow as any];
            }
            // Listen to the observable and by `changeShallow` if the argument was shallow(...)
            const listener = obs._on(shallow ? 'changeShallow' : 'change', onChange) as ObservableListener;
            saved.proxies[i] = [obs, listener];
        }
    }
}
