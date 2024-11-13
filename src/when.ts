import { isObservable } from './globals';
import { computeSelector, isObservableValueReady } from './helpers';
import { isArray, isFunction, isPromise } from './is';
import type { ObserveEvent, Selector } from './observableInterfaces';
import { observe } from './observe';

// Modify the _when function
function _when<T, T2>(predicate: Selector<T> | Selector<T>[], effect?: (value: T) => T2, checkReady?: boolean): any {
    // If predicate is a regular Promise skip all the observable stuff
    if (isPromise<T>(predicate)) {
        return effect ? predicate.then(effect) : (predicate as any);
    }

    const isPredicateArray = isArray(predicate);

    let value: T | undefined;
    let effectValue: T2 | undefined;

    // Create a wrapping fn that calls the effect if predicate returns true
    function run(e: ObserveEvent<T>) {
        const ret = isPredicateArray ? predicate.map((p) => computeSelector(p)) : computeSelector(predicate);

        if (isPromise(ret)) {
            value = ret as any;
            // We want value to be the Promise but return undefined
            // so it doesn't run the effect with the Promise as the value
            return undefined;
        } else {
            let isOk: any = true;
            if (isArray(ret)) {
                for (let i = 0; i < ret.length; i++) {
                    let item = ret[i];
                    if (isObservable(item)) {
                        item = computeSelector(item);
                    } else if (isFunction(item)) {
                        item = item();
                    }
                    isOk = isOk && !!(checkReady ? isObservableValueReady(item) : item);
                }
            } else {
                isOk = checkReady ? isObservableValueReady(ret) : ret;
            }
            if (isOk) {
                value = ret as T;

                // Set cancel so that observe does not track anymore
                e.cancel = true;
            }
        }

        return value;
    }
    function doEffect() {
        // If value is truthy then run the effect
        effectValue = effect?.(value!);
    }
    // Run in an observe
    observe(run, doEffect);

    // If first run resulted in a truthy value just return it.
    // It will have set e.cancel so no need to dispose
    if (isPromise<T>(value)) {
        return effect ? value.then(effect) : (value as any);
    } else if (value !== undefined) {
        return effect ? effectValue : Promise.resolve(value);
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
export function when<T, T2>(predicate: Selector<T>[], effect: (value: T[]) => T2): Promise<T2>;
export function when<T, T2>(predicate: Selector<T>, effect: (value: T) => T2): Promise<T2>;
export function when<T>(predicate: Selector<T>[]): Promise<T[]>;
export function when<T>(predicate: Selector<T>): Promise<T>;
export function when<T, T2>(predicate: Selector<T>, effect?: (value: T) => T2): Promise<T | T2> {
    return _when<T, T2>(predicate, effect, false);
}

export function whenReady<T, T2>(predicate: Promise<T>, effect: (value: T) => T2): Promise<T2>;
export function whenReady<T, T2>(predicate: Selector<T>[], effect: (value: T[]) => T2): Promise<T2[]>;
export function whenReady<T, T2>(predicate: Selector<T>, effect: (value: T) => T2): Promise<T2>;
export function whenReady<T>(predicate: Selector<T>[]): Promise<T[]>;
export function whenReady<T>(predicate: Selector<T>): Promise<T>;
export function whenReady<T, T2>(predicate: Selector<T>, effect?: (value: T) => T2): Promise<T | T2> {
    return _when<T, T2>(predicate, effect, true);
}
