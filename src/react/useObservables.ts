import { isArray, isObject } from '@legendapp/tools';
import { useForceRender } from '@legendapp/tools/react';
import { useEffect, useRef } from 'react';
import { isObservable, isObservableEvent } from '../observableFns';
import {
    MappedObservableValue,
    ObservableListener,
    Observable,
    ObservableChecker,
    ObservableEvent,
    ObservableValue,
} from '../observableInterfaces';
import { disposeListener } from '../observableListener';
import { state } from '../observableState';

interface SavedRefTrack {
    proxies: [Observable, string, ObservableListener][];
}

function getRawValue<T extends ObservableChecker | ObservableEvent>(obs: T): ObservableValue<T> {
    return obs && (isObservableEvent(obs) ? undefined : isObservable(obs) ? obs.get() : obs);
}

export function useObservables<
    T extends
        | (ObservableChecker | ObservableEvent)
        | (ObservableChecker | ObservableEvent)[]
        | Record<string, ObservableChecker>
>(fn: () => T): MappedObservableValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRefTrack>();
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
                ref.current.proxies.forEach((p) => disposeListener(p[2]));
                ref.current.proxies = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    if (isArr) {
        return arr.map(getRawValue) as any;
    } else if (isObj) {
        const ret = args;
        Object.keys(args).forEach((key) => (ret[key] = getRawValue(args[key])));
        return ret as any;
    } else {
        return getRawValue(args);
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
            disposeListener(p[2]);
        }
    }
    // Listen to all tracked proxies
    for (let i = 0; i < tracked.length; i++) {
        const p = tracked[i];
        if (p) {
            const [obs, prop, shallow] = p;
            let found = false;
            for (let u = 0; u < saved.proxies.length; u++) {
                if (saved.proxies[u][0] === obs && saved.proxies[u][1] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found && isObservable(obs)) {
                const listener = (prop ? obs.prop(prop) : obs).on(
                    shallow ? 'changeShallow' : 'change',
                    onChange
                ) as ObservableListener;
                saved.proxies.push([obs, prop, listener]);
            }
        }
    }
};
