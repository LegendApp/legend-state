import { observe } from './effect';

export function when(predicate: () => any): Promise<void>;
export function when(predicate: () => any, effect: () => void | (() => void)): () => void;
export function when(predicate: () => any, effect?: () => void | (() => void)) {
    let cleanup: () => void;
    let isDone = false;

    // Create a wrapping fn that calls the effect if predicate returns true
    function run() {
        const ret = predicate();
        if (ret) {
            // If value is truthy then run the effect and cleanup
            isDone = true;
            effect();
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
