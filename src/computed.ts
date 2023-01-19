import { afterBatch, batch } from './batching';
import { getNode, lockObservable } from './helpers';
import { isPromise } from './is';
import { observable } from './observable';
import { ObservableComputed, ObservableComputedTwoWay } from './observableInterfaces';
import { observe } from './observe';

export function computed<T>(compute: () => T | Promise<T>): ObservableComputed<T>;
export function computed<T>(compute: () => T | Promise<T>, set: (value: T) => void): ObservableComputedTwoWay<T>;
export function computed<T>(
    compute: () => T | Promise<T>,
    setBound?: (value: T) => void
): ObservableComputed<T> | ObservableComputedTwoWay<T> {
    // Create an observable for this computed variable
    let obs = observable<T>();
    if (!setBound) lockObservable(obs, true);

    // Lazily activate the observable when get is called
    getNode(obs).root.activate = () => {
        let setting = false;
        const set = function (val: any) {
            if (val !== obs.peek()) {
                // Update the computed value
                if (setBound) {
                    setting = true;
                    afterBatch(() => (setting = false));
                } else {
                    lockObservable(obs, false);
                }
                obs.set(val);
                if (!setBound) lockObservable(obs, true);
            }
        };

        observe(compute, ({ value }) => {
            if (isPromise<T>(value)) {
                value.then((v) => set(v));
            } else {
                set(value);
            }
        });

        if (setBound) {
            obs.onChange(({ value }) => {
                if (!setting) {
                    batch(() => setBound(value));
                }
                setting = false;
            });
        }
    };

    return obs as ObservableComputed<T>;
}
