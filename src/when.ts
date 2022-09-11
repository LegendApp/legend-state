import { observe } from './effect';

interface Options {
    repeat?: boolean;
}

export function when(predicate: () => any): Promise<void>;
export function when(predicate: () => any, effect: () => void | (() => void), options?: Options): () => void;
export function when(predicate: () => any, effect?: () => void | (() => void), options?: Options) {
    let cleanup: () => void;
    let isDone = false;

    // Create a wrapping fn that calls the effect if predicate returns true
    const fn = function () {
        const ret = predicate();
        if (ret) {
            // If value is truthy then run the effect and cleanup
            if (!options?.repeat) {
                isDone = true;
            }
            effect();
            if (isDone) {
                cleanup?.();
            }
        }
    };

    // If no effect parameter return a promise
    const promise =
        !effect &&
        new Promise<void>((resolve) => {
            effect = resolve;
        });

    // Create an effect for the fn
    cleanup = observe(fn);

    // If it's already cleanup
    if (isDone) {
        cleanup();
    }

    return promise || cleanup;
}
