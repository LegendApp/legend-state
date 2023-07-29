import { computeSelector, isObservableValueReady } from './helpers';
import type { ObserveEvent, Selector } from './observableInterfaces';
import { observe } from './observe';

function _when<T>(predicate: Selector<T>, effect?: (value: T) => any | (() => any), checkReady?: boolean): Promise<T> {
    let value: T | undefined;
    // Create a wrapping fn that calls the effect if predicate returns true
    function run(e: ObserveEvent<T>) {
        const ret = computeSelector(predicate);

        if (checkReady ? isObservableValueReady(ret) : ret) {
            value = ret;
            // If value is truthy then run the effect
            effect?.(ret);

            // Set cancel so that observe does not track
            e.cancel = true;
        }
    }
    // Run in an observe
    observe(run);

    // If first run resulted in a truthy value just return it.
    // It will have set e.cancel so no need to dispose
    if (value !== undefined) {
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
