import { computeSelector } from './helpers';
import { isArray, isEmpty, isObject } from './is';
import type { ObserveEvent, Selector } from './observableInterfaces';
import { observe } from './observe';

export function when<T>(predicate: Selector<T>): Promise<T>;
export function when<T>(predicate: Selector<T>, effect: (value: T) => any | (() => any)): () => void;
export function when<T>(predicate: Selector<T>, effect?: (value: T) => any | (() => any)) {
    // Create a wrapping fn that calls the effect if predicate returns true
    function run(e: ObserveEvent<T>) {
        const ret = computeSelector(predicate);

        if (ret && !((isObject(ret) && isEmpty(ret)) || (isArray(ret) && ret.length === 0))) {
            // If value is truthy then run the effect
            effect!(ret);

            // Set cancel so that observe does not track
            e.cancel = true;
        }
    }

    // If no effect parameter return a promise
    const promise =
        !effect &&
        new Promise<T>((resolve) => {
            effect = resolve;
        });

    // Create an effect for the fn
    const dispose = observe(run);

    return promise || dispose;
}
