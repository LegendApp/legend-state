import { observe } from './observe';
import { observable } from './observable';
import { Observable, ObservableComputed } from './observableInterfaces';
import { lockObservable } from './helpers';

export function computed<T>(compute: () => T): ObservableComputed<T> {
    // Create an observable for this computed variable set to the initial value
    let obs: Observable;

    const fn = function () {
        const val = compute();
        if (obs) {
            // Update the computed value
            lockObservable(obs, false);
            obs.set(val);
            lockObservable(obs, true);
        } else {
            // Create the observable on the first run
            obs = observable(val);
            lockObservable(obs, true);
        }
    };

    observe(fn);

    return obs as unknown as ObservableComputed<T>;
}
