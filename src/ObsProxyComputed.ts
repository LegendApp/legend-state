import { obsProxy } from './ObsProxy';
import { listenToObs } from './ObsProxyFns';
import { MappedProxyValue, ObsProxy } from './ObsProxyInterfaces';

function onChanged(proxy: ObsProxy, args: ObsProxy[], compute: (...args: any) => any) {
    const value = compute(...args.map((a) => a.value));
    proxy.value = value;
}

export function obsProxyComputed<T, TA extends ObsProxy[]>(args: TA, compute: (...args: MappedProxyValue<TA>) => T) {
    // Create a proxy for this computed variable
    const proxy = obsProxy<T>(undefined);

    // Create a handler for this proxy
    const handler = onChanged.bind(this, proxy, args, compute);

    // Listen for changes
    listenToObs(args, handler);

    // Update the initial value
    onChanged(proxy, args, compute);

    return proxy;
}
