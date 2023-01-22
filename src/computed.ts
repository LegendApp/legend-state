import { afterBatch, batch } from './batching';
import { getNode, lockObservable } from './helpers';
import { isPromise } from './is';
import { observable } from './observable';
import { ObservableComputed, ObservableComputedTwoWay } from './observableInterfaces';
import { observe } from './observe';

export function computed<T>(compute: () => T | Promise<T>): ObservableComputed<T>;
export function computed<T, T2 = T>(
    compute: () => T | Promise<T>,
    set: (value: T2) => void
): ObservableComputedTwoWay<T, T2>;
export function computed<T, T2 = T>(
    compute: () => T | Promise<T>,
    set?: (value: T2) => void
): ObservableComputed<T> | ObservableComputedTwoWay<T, T2> {
    // Create an observable for this computed variable
    let obs = observable<T>();
    if (!set) lockObservable(obs, true);

    // Lazily activate the observable when get is called
    getNode(obs).root.activate = () => {
        let setting = false;
        const setInner = function (val: any) {
            if (val !== obs.peek()) {
                // Update the computed value
                if (set) {
                    setting = true;
                    afterBatch(() => (setting = false));
                } else {
                    lockObservable(obs, false);
                }
                obs.set(val);
                if (!set) lockObservable(obs, true);
            }
        };

        observe(compute, ({ value }) => {
            if (isPromise<T>(value)) {
                value.then((v) => setInner(v));
            } else {
                setInner(value);
            }
        });

        if (set) {
            obs.onChange(({ value }) => {
                if (!setting) {
                    batch(() => set(value));
                }
                setting = false;
            });
        }
    };

    return obs as ObservableComputed<T>;
}
