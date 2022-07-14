import { isArray, useForceRender } from '@legendapp/tools';
import { useEffect, useRef } from 'react';
import { isObservable, isTrigger } from '../globals';
import {
    MappedObservableValue,
    ObsListener,
    Observable,
    ObservableChecker,
    ObservableTrigger,
} from '../observableInterfaces';
import { disposeListener } from '../observableListener';
import { state } from '../observableState';

interface SavedRefTrack {
    proxies: [Observable, string, ObsListener][];
}

export function useObservables<T extends (ObservableChecker | ObservableTrigger)[] | Record<string, ObservableChecker>>(
    fn: () => T
): MappedObservableValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRefTrack>();
    if (!ref.current) {
        ref.current = {
            proxies: [],
        };
    }

    state.isTracking = true;

    const ret = fn();

    const isArr = isArray(ret);

    const arr = (isArr ? ret : Object.values(ret)) as Observable[];

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
                ref.current.proxies.forEach((p) => disposeListener(p[2]));
                ref.current.proxies = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    if (isArr) {
        return arr.map(
            (obs) => obs && (isTrigger(obs) ? undefined : isObservable(obs) ? obs.get() : obs)
        ) as unknown as MappedObservableValue<T>;
    } else {
        Object.keys(ret).forEach((key) => {
            const obs = ret[key];
            if (isObservable(obs)) {
                ret[key] = obs.get();
            }
        });
        return ret as MappedObservableValue<T>;
    }
}

const updateListeners = (ret: Observable[], saved: SavedRefTrack, onChange: () => void) => {
    const tracked = state.trackedProxies;
    const trackedRoots = state.trackedRootProxies;
    for (let i = 0; i < ret.length; i++) {
        const r = ret[i];
        if (r && !trackedRoots.includes(r)) {
            const info = state.infos.get(r);
            if (info) {
                tracked.push([r, undefined]);
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
            disposeListener(p[2]);
        }
    }
    // Listen to all tracked proxies
    for (let i = 0; i < tracked.length; i++) {
        const p = tracked[i];
        if (p) {
            const [obs, prop] = p;
            let found = false;
            for (let u = 0; u < saved.proxies.length; u++) {
                if (saved.proxies[u][0] === obs && saved.proxies[u][1] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found && isObservable(obs)) {
                const listener = (prop ? obs.prop(prop) : obs).on('change', onChange);
                saved.proxies.push([obs, prop, listener]);
            }
        }
    }
};
