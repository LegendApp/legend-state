import { computeSelector, isObservableValueReady } from './helpers';
import { isPromise } from './is';
import type { ObserveEvent, Selector } from './observableInterfaces';
import { observe } from './observe';

function _when<T, T2>(predicate: Selector<T>, effect?: (value: T) => T2, checkReady?: boolean): any {
    // If predicate is a regular Promise skip all the observable stuff
    if (isPromise<T>(predicate)) {
        return effect ? predicate.then(effect) : (predicate as any);
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
        return effect ? value.then(effect) : (value as any);
    } else if (value !== undefined) {
        return effect ? effect(value) : Promise.resolve(value);
    } else {
        // Wrap it in a promise
        const promise = new Promise<T2>((resolve) => {
            if (effect) {
                const originalEffect = effect;
                effect = ((value: T) => {
                    const effectValue = originalEffect(value);
                    resolve(isPromise(effectValue) ? effectValue.then((value) => value as T2) : effectValue);
                }) as any;
            } else {
                effect = resolve as any;
            }
        });

        return promise;
    }
}

export function when<T, T2>(predicate: Promise<T>, effect: (value: T) => T2): Promise<T2>;
export function when<T, T2>(predicate: Selector<T>, effect: (value: T) => T2): Promise<T2>;
export function when<T>(predicate: Selector<T>): Promise<T>;
export function when<T, T2>(predicate: Selector<T>, effect?: (value: T) => T2): Promise<T | T2> {
    return _when<T, T2>(predicate, effect, false);
}
export function whenReady<T, T2>(predicate: Promise<T>, effect: (value: T) => T2): Promise<T2>;
export function whenReady<T, T2>(predicate: Selector<T>, effect: (value: T) => T2): Promise<T2>;
export function whenReady<T>(predicate: Selector<T>): Promise<T>;
export function whenReady<T, T2>(predicate: Selector<T>, effect?: (value: T) => T2): Promise<T | T2> {
    return _when<T, T2>(predicate, effect, true);
}
