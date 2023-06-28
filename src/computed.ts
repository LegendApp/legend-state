import { batch } from './batching';
import { getNode, lockObservable } from './helpers';
import { isPromise, isString } from './is';
import { observable, set as setBase } from './observable';
import { ObservableComputed, ObservableComputedTwoWay, ObservableReadable } from './observableInterfaces';
import { observe } from './observe';

export function computed<T>(compute: () => T | Promise<T>, name?: string): ObservableComputed<T>;
export function computed<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set: (value: T2) => void,
    name?: string
): ObservableComputedTwoWay<T, T2>;
export function computed<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set?: string | ((value: T2) => void),
    name?: string
): ObservableComputed<T> | ObservableComputedTwoWay<T, T2> {
    if (!name && isString(set)) {
        name = set;
        set = undefined;
    }

    // Create an observable for this computed variable
    const obs = observable<T>(undefined, name);
    lockObservable(obs, true);

    // Lazily activate the observable when get is called
    const node = getNode(obs);
    const setInner = function (val: any) {
        if (val !== obs.peek()) {
            // Update the computed value
            lockObservable(obs, false);
            setBase(node, val);
            lockObservable(obs, true);
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
        node.root.set = (value: any) => {
            batch(() => (set as (value: T2) => void)(value));
        };
    }

    return obs as ObservableComputed<T>;
}
