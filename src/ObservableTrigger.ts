import { observable } from './Observable';
import type { Observable, ObservableTrigger } from './ObservableInterfaces';

function triggerNotifier(obs: Observable<number>) {
    obs.set(obs.get() + 1);
}

function triggerOn(obs: Observable<number>, arg1?: 'change' | (() => void), arg2?: () => void) {
    const fn = (arg2 || arg1) as () => void;
    if (fn) {
        return obs.on('change', fn);
    }
}

export function observableTrigger(): ObservableTrigger {
    const obs = observable(0);
    return {
        notify: triggerNotifier.bind(obs, obs),
        on: triggerOn.bind(obs, obs),
    };
}
