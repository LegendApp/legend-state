import { state } from './ObsProxyState';
import { obsProxy } from './ObsProxy';
import { MappedProxyValue, ObsProxy, ObsProxyChecker } from './ObsProxyInterfaces';

function onChanged<T>(proxy: ObsProxy, fn: () => T) {
    proxy.set(fn());
}

export function obsProxyComputed<T>(fn: () => T) {
    state.isTracking = true;

    // Create a proxy for this computed variable
    const proxy = obsProxy<T>(fn());

    // Listen to all tracked proxies
    state.trackedProxies.forEach(([tracked, prop]) =>
        (prop ? tracked.prop(prop) : tracked).on('change', onChanged.bind(this, proxy, fn))
    );

    // Reset state
    state.isTracking = false;
    state.trackedProxies = [];

    return proxy;
}
