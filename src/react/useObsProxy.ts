import { isArray, useForceRender } from '@legendapp/tools';
import { useEffect, useRef } from 'react';
import { isProxy, isTrigger } from '../globals';
import { MappedProxyValue, ObsListener, ObsProxy, ObsProxyChecker, ObsProxyTrigger } from '../ObsProxyInterfaces';
import { disposeListener } from '../ObsProxyListener';
import { state } from '../ObsProxyState';

interface SavedRefTrack {
    proxies: [ObsProxy, string, ObsListener][];
}

export function useObsProxy<T extends (ObsProxyChecker | ObsProxyTrigger)[] | Record<string, ObsProxyChecker>>(
    fn: () => T
): MappedProxyValue<T> {
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

    const arr = (isArr ? ret : Object.values(ret)) as ObsProxy[];

    // Compare to previous args and update listeners if any changed or first mount
    updateListeners(arr as ObsProxy[], ref.current, forceRender);

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
            (obs) => obs && (isTrigger(obs) ? undefined : isProxy(obs) ? obs.get() : obs)
        ) as unknown as MappedProxyValue<T>;
    } else {
        Object.keys(ret).forEach((key) => {
            const obs = ret[key];
            if (isProxy(obs)) {
                ret[key] = obs.get();
            }
        });
        return ret as MappedProxyValue<T>;
    }
}

const updateListeners = (ret: ObsProxy[], saved: SavedRefTrack, onChange: () => void) => {
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
            const [proxy, prop] = p;
            let found = false;
            for (let u = 0; u < saved.proxies.length; u++) {
                if (saved.proxies[u][0] === proxy && saved.proxies[u][1] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found && isProxy(proxy)) {
                const listener = (prop ? proxy.prop(prop) : proxy).on('change', onChange);
                saved.proxies.push([proxy, prop, listener]);
            }
        }
    }
};
