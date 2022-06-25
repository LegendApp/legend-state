import { obsProxy } from './ObsProxy';
import { listenToObs } from './ObsProxyFns';
import { MappedProxyValue, ObsProxy, ObsProxyUnsafe } from './ObsProxyInterfaces';

function onChanged(proxy: ObsProxy, args: (ObsProxy | ObsProxyUnsafe)[], compute: (...args: any) => any) {
    const value = compute(...args.map((a) => a.get()));
    proxy.set(value);
}

export function obsProxyComputed<T extends object, TA extends (ObsProxy | ObsProxyUnsafe)[]>(
    args: TA,
    compute: (...args: MappedProxyValue<TA>) => T
) {
    // Create a proxy for this computed variable
    const proxy = obsProxy<T>(compute(...(args.map((a) => a.get()) as any)));

    // Create a handler for this proxy
    const handler = onChanged.bind(this, proxy, args, compute);

    // Listen for changes
    listenToObs(args, handler);

    return proxy;
}
