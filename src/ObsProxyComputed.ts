import { obsProxy } from './ObsProxy';
import { ObsProxy, ValidObsProxyParam } from './ObsProxyInterfaces';
import { state } from './ObsProxyState';

function onChanged<T>(proxy: ObsProxy, fn: () => T) {
    proxy.set(fn());
}

export function obsProxyComputed<T>(fn: () => ValidObsProxyParam<T>) {
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
