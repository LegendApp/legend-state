import { obsProxy } from './ObsProxy';
import { listenToObs } from './ObsProxyFns';
import { MappedProxyValue, ObsProxy, ObsProxyUnsafe } from './ObsProxyInterfaces';

function onChanged(proxy: ObsProxy, args: (ObsProxy | ObsProxyUnsafe)[], compute: (...args: any) => any) {
    const value = compute(...args);
    proxy.set(value);
}

export function obsProxyComputed<T extends object, TA extends (ObsProxy | ObsProxyUnsafe)[]>(
    args: TA,
    compute: (...args: TA) => T
) {
    // Create a proxy for this computed variable
    const proxy = obsProxy<T>(compute(...args));

    // Create a handler for this proxy
    const handler = onChanged.bind(this, proxy, args, compute);

    // Listen for changes
    args.forEach((obs) => listenToObs(obs, handler));

    return proxy;
}
