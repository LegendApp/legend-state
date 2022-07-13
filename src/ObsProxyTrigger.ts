import { obsProxy } from './ObsProxy';
import type { ObsProxy, ObsProxyTrigger } from './ObsProxyInterfaces';

function triggerNotifier(obs: ObsProxy<number>) {
    obs.set(obs.get() + 1);
}

function triggerOn(obs: ObsProxy<number>, arg1?: 'change' | (() => void), arg2?: () => void) {
    const fn = (arg2 || arg1) as () => void;
    if (fn) {
        return obs.on('change', fn);
    }
}

export function obsProxyTrigger(): ObsProxyTrigger {
    const obs = obsProxy(0);
    return {
        notify: triggerNotifier.bind(obs, obs),
        on: triggerOn.bind(obs, obs),
    };
}
