import { observe } from './observe';

export function when<T>(predicate: () => T): Promise<T>;
export function when<T>(predicate: () => T, effect: (T) => void | (() => void)): () => void;
export function when<T>(predicate: () => T, effect?: (T) => void | (() => void)) {
    let cleanup: () => void;
    let isDone = false;

    // Create a wrapping fn that calls the effect if predicate returns true
    function run() {
        const ret = predicate();
        if (ret) {
            // If value is truthy then run the effect and cleanup
            isDone = true;
            effect(ret);
            cleanup?.();
        }
    }

    // If no effect parameter return a promise
    const promise =
        !effect &&
        new Promise<void>((resolve) => {
            effect = resolve;
        });

    // Create an effect for the fn
    cleanup = observe(run);

    // If it's already cleanup
    if (isDone) {
        cleanup();
    }

    return promise || cleanup;
}
