import { observable } from './observable';
import type { Observable, ObservableEvent } from './observableInterfaces';

function eventNotifier(obs: Observable<number>) {
    // Notify increments the value so that the observable changes
    obs.set(obs.get() + 1);
}

function eventOn(obs: Observable<number>, arg1?: 'change' | (() => void), arg2?: () => void) {
    // Pass the on function through to the underlying observable's on function
    // This extra step is just a convenience to allow observableEvent's on function to
    // make the 'change' parameter optional.
    const fn = (arg2 || arg1) as () => void;
    if (fn) {
        return obs.on('change', fn);
    }
}

export function observableEvent(): ObservableEvent {
    // observableEvent simply wraps around a number observable which increments its value
    // to fire change events
    const obs = observable(0);
    return {
        fire: eventNotifier.bind(obs, obs),
        on: eventOn.bind(obs, obs),
    };
}
