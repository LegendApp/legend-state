import { useForceRender } from '@legendapp/tools';
import { useEffect, useRef, MutableRefObject } from 'react';
import { isProxy } from '../globals';
import { MappedProxyValue, ObsListener, ObsProxy, ObsProxyChecker, ObsProxyUnsafe } from '../ObsProxyInterfaces';
import { disposeListener } from '../ObsProxyListener';
import { state } from '../ObsProxyState';

interface SavedRef {
    args?: ObsProxyChecker[];
    listeners?: ObsListener[];
}

interface SavedRefTrack {
    proxies: [ObsProxy, string, ObsListener][];
}

function useObsProxy<T extends ObsProxyChecker[]>(...args: T): MappedProxyValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: [],
        };
    }

    // Compare to previous args and update listeners if any changed or first mount
    updateListeners(args, ref.current.args, ref.current.listeners, forceRender);

    ref.current.args = args;

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            if (ref.current.listeners) {
                ref.current.listeners.forEach(disposeListener);
                ref.current.listeners = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    return args.map((obs) => (obs ? obs.get() : obs)) as MappedProxyValue<T>;
}

const updateListeners = (
    args: ObsProxyChecker[],
    prevArgs: (ObsProxy | ObsProxyUnsafe)[],
    listeners: ObsListener[],
    onChange: () => void
) => {
    const num = Math.max(args.length, prevArgs ? prevArgs.length : 0);
    for (let i = 0; i < num; i++) {
        let obs = args[i];
        if (!prevArgs || obs !== prevArgs[i]) {
            if (listeners[i]) {
                disposeListener(listeners[i]);
                listeners[i] = undefined;
            }

            if (obs) {
                listeners[i] = obs.on('change', onChange);
            }
        }
    }
};

function useObsProxyTrack<T extends ObsProxyChecker[]>(fn: () => T): MappedProxyValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRefTrack>();
    if (!ref.current) {
        ref.current = {
            proxies: [],
        };
    }

    state.isTracking = true;

    const ret = fn();

    // Compare to previous args and update listeners if any changed or first mount
    updateListenersTrack(ret as ObsProxy[], ref.current, forceRender);

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

    return ret.map((obs) => (obs && isProxy(obs) ? obs.get() : obs)) as MappedProxyValue<T>;
}

const updateListenersTrack = (ret: ObsProxy[], saved: SavedRefTrack, onChange: () => void) => {
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

export { useObsProxy, useObsProxyTrack };
