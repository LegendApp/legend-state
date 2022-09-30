import { isPromise } from './is';
import { getNode, lockObservable } from './helpers';
import { observable } from './observable';
import { ObservableComputed } from './observableInterfaces';
import { observe } from './observe';

export function computed<T>(compute: () => T): ObservableComputed<T> {
    // Create an observable for this computed variable
    let obs = observable<T>();
    lockObservable(obs, true);

    // Lazily activate the observable when get is called
    getNode(obs).root.activate = () => {
        const set = function (val) {
            // Update the computed value
            lockObservable(obs, false);
            obs.set(val);
            lockObservable(obs, true);
        };
        const fn = function () {
            let val = compute();
            if (isPromise<T>(val)) {
                val.then((v) => set(v));
            } else {
                set(val);
            }
        };

        observe(fn);
    };

    return obs as unknown as ObservableComputed<T>;
}
