import { observable } from './observable';
import type { Observable, ObservableEvent } from './observableInterfaces';

function eventNotifier(obs: Observable<number>) {
    obs.set(obs.get() + 1);
}

function eventOn(obs: Observable<number>, arg1?: 'change' | (() => void), arg2?: () => void) {
    const fn = (arg2 || arg1) as () => void;
    if (fn) {
        return obs.on('change', fn);
    }
}

export function observableEvent(): ObservableEvent {
    const obs = observable(0);
    return {
        fire: eventNotifier.bind(obs, obs),
        on: eventOn.bind(obs, obs),
    };
}
