import { batch } from './batching';
import { getNode, lockObservable } from './helpers';
import { isPromise } from './is';
import { observable, set as setBase } from './observable';
import { NodeValue, ObservableComputed, ObservableComputedTwoWay } from './observableInterfaces';
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
    const obs = observable<T>();
    if (!set) lockObservable(obs, true);

    // Lazily activate the observable when get is called
    const node = getNode(obs);
    const setInner = function (val: any) {
        if (val !== obs.peek()) {
            // Update the computed value
            if (!set) {
                lockObservable(obs, false);
            }
            setBase(node, val);
            if (!set) lockObservable(obs, true);
        }
    };
    node.root.activate = () => {
        observe(
            compute,
            ({ value }) => {
                if (isPromise<T>(value)) {
                    value.then((v) => setInner(v));
                } else {
                    setInner(value);
                }
            },
            { immediate: true }
        );
    };

    if (set) {
        node.fns = {
            set: (_: NodeValue, value: any) => {
                // Set the correct value first
                setInner(value);
                // Then call the setter for its side effects.
                // It's possible the setter will cause compute to return a different value,
                // but in correct cases the setInner triggered by compute will no-op.
                batch(() => set(value));
            },
        };
    }

    return obs as ObservableComputed<T>;
}
