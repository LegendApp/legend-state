import { obsProxy } from './ObsProxy';
import { listenToObs } from './ObsProxyFns';
import { MappedProxyValue, ObsProxy, ObsProxyChecker, ObsProxyUnsafe } from './ObsProxyInterfaces';

function onChanged(proxy: ObsProxy, args: ObsProxyChecker[], compute: (...args: any) => any) {
    const value = compute(...args.map((arg) => arg.get()));
    proxy.set(value);
}

export function obsProxyComputed<T extends object, TA extends ObsProxyChecker[]>(
    args: TA,
    compute: (...args: MappedProxyValue<TA>) => T
) {
    // Create a proxy for this computed variable
    const proxy = obsProxy<T>(compute(...(args.map((obs) => obs.get()) as MappedProxyValue<TA>)));

    // Create a handler for this proxy
    const handler = onChanged.bind(this, proxy, args, compute);

    // Listen for changes
    args.forEach((obs) => listenToObs(obs, handler));

    return proxy;
}
