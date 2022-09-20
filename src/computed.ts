import { getNode, lockObservable } from './helpers';
import { observable } from './observable';
import { ObservableComputed } from './observableInterfaces';
import { observe } from './observe';

export function computed<T>(compute: () => T): ObservableComputed<T> {
    // Create an observable primitive for this computed variable
    let obs = observable<T>();
    lockObservable(obs, true);

    // Lazily activate the observable when get is called
    getNode(obs).activate = () => {
        const fn = function () {
            const val = compute();
            if (obs) {
                // Update the computed value
                lockObservable(obs, false);
                obs.set(val);
                lockObservable(obs, true);
            }
        };

        observe(fn);
    };

    return obs as unknown as ObservableComputed<T>;
}
