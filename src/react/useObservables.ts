import { isArray, isObject } from '@legendapp/tools';
import { useForceRender } from '@legendapp/tools/react';
import { useEffect, useRef } from 'react';
import { isObservable, isObservableEvent } from '../observableFns';
import {
    MappedObservableValue,
    Observable,
    ObservableChecker,
    ObservableCheckerLoose,
    ObservableEvent,
    ObservableListener,
    ObservableValue,
} from '../observableInterfaces';
import { state } from '../observableState';

interface SavedRef {
    proxies: [Observable, string, ObservableListener][];
}

function getRawValue<T extends ObservableChecker | ObservableEvent>(obs: T): ObservableValue<T> {
    return obs && (isObservableEvent(obs) ? undefined : isObservable(obs) ? obs.get() : obs);
}

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables<
    T extends ObservableCheckerLoose | ObservableCheckerLoose[] | Record<string, ObservableCheckerLoose>
>(fn: () => T): MappedObservableValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            proxies: [],
        };
    }

    state.isTracking = true;

    const args = fn();

    const isArr = isArray(args);
    const isObj = !isArr && isObject(args);

    const arr = (isArr ? args : isObj ? Object.values(args) : [args]) as Observable[];

    // Compare to previous args and update listeners if any changed or first mount
    updateListeners(arr as Observable[], ref.current, forceRender);

    // Reset state
    state.isTracking = false;
    state.trackedProxies = [];
    state.trackedRootProxies = [];

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            if (ref.current.proxies) {
                ref.current.proxies.forEach((p) => p[2].dispose());
                ref.current.proxies = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    // Return the raw values based on the shape of the arguments
    if (isArr) {
        return arr.map(getRawValue) as any;
    } else if (isObj) {
        const ret = {};
        Object.keys(args).forEach((key) => (ret[key] = getRawValue(args[key])));
        return ret as any;
    } else {
        return getRawValue(args);
    }
}

const updateListeners = (ret: Observable[], saved: SavedRef, onChange: () => void) => {
    const tracked = state.trackedProxies;
    const trackedRoots = state.trackedRootProxies;
    // Passing the root of an observable will not trigger any tracking from the proxies, so
    // need to add them to the array of observables to listen
    for (let i = 0; i < ret.length; i++) {
        const r = ret[i];
        if (r && !trackedRoots.includes(r)) {
            const info = state.infos.get(r);
            if (info) {
                tracked.push([r, undefined, false]);
            }
        }
    }
    // Unlisten proxies no longer tracked
    for (let i = 0; i < saved.proxies.length; i++) {
        const p = saved.proxies[i];
        let found = false;
        for (let u = 0; u < tracked.length; u++) {
            if (tracked[u][0] === p[0] && tracked[u][1] === p[1]) {
                found = true;
                break;
            }
        }
        if (!found) {
            saved.proxies.splice(i--, 1);
            p[2].dispose();
        }
    }
    // Listen to all tracked proxies
    for (let i = 0; i < tracked.length; i++) {
        const p = tracked[i];
        // Skip arguments that are undefined
        if (p) {
            const [obs, prop, shallow] = p;

            // Skip arguments that are not observables
            if (isObservable(obs)) {
                let found = false;
                // If already listening to this observable, can skip it
                for (let u = 0; u < saved.proxies.length; u++) {
                    if (saved.proxies[u][0] === obs && saved.proxies[u][1] === prop) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    // Listen to the observable, by prop if applicable, and by `changeShallow`
                    // if the argument was shallow(...)
                    const listener = (prop ? obs.prop(prop) : obs).on(
                        shallow ? 'changeShallow' : 'change',
                        onChange
                    ) as ObservableListener;
                    saved.proxies.push([obs, prop, listener]);
                }
            }
        }
    }
};
