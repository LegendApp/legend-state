import { computeSelector, isObservableValueReady } from './helpers';
import { isPromise } from './is';
import type { Selector } from './observableInterfaces';
import { ObserveEvent, observe } from './observe';

function _when<T>(predicate: Selector<T>, effect?: (value: T) => any | (() => any), checkReady?: boolean): Promise<T> {
    // If predicate is a regular Promise skip all the observable stuff
    if (isPromise<T>(predicate)) {
        return effect ? predicate.then(effect) : predicate;
    }

    let value: T | undefined;

    // Create a wrapping fn that calls the effect if predicate returns true
    function run(e: ObserveEvent<T>) {
        const ret = computeSelector(predicate);

        if (!isPromise(ret) && (checkReady ? isObservableValueReady(ret) : ret)) {
            value = ret;

            // Set cancel so that observe does not track anymore
            e.cancel = true;
        }

        return value;
    }
    function doEffect() {
        // If value is truthy then run the effect
        effect?.(value!);
    }
    // Run in an observe
    observe(run, doEffect);

    // If first run resulted in a truthy value just return it.
    // It will have set e.cancel so no need to dispose
    if (isPromise<T>(value)) {
        return effect ? value.then(effect) : value;
    } else if (value !== undefined) {
        return Promise.resolve(value);
    } else {
        // Wrap it in a promise
        const promise = new Promise<T>((resolve) => {
            if (effect) {
                const originalEffect = effect;
                effect = (value) => {
                    const effectValue = originalEffect(value);
                    resolve(effectValue);
                };
            } else {
                effect = resolve;
            }
        });

        return promise;
    }
}

export function when<T>(predicate: Selector<T>, effect?: (value: T) => any | (() => any)): Promise<T> {
    return _when<T>(predicate, effect, false);
}
export function whenReady<T>(predicate: Selector<T>, effect?: (value: T) => any | (() => any)): Promise<T> {
    return _when<T>(predicate, effect, true);
}
