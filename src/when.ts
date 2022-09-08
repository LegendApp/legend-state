import { effect as observableEffect } from './effect';

interface Options {
    repeat?: boolean;
}

export function when(predicate: () => any): Promise<void>;
export function when(predicate: () => any, effect: () => void | (() => void), options?: Options): () => void;
export function when(predicate: () => any, effect?: () => void | (() => void), options?: Options) {
    let cleanupListeners: () => void;
    let cleanup: () => void;
    let isDone = false;

    const fn = function () {
        const ret = predicate();
        if (ret) {
            // If value is truthy then run the effect and cleanup
            if (!options?.repeat) {
                isDone = true;
            }
            cleanup = effect() as () => void;
            if (isDone) {
                cleanupListeners?.();
            }
        } else if (cleanup) {
            cleanup();
            cleanup = undefined;
        }
    };

    if (effect) {
        cleanupListeners = observableEffect(fn);
        // If it's already cleanup
        if (isDone) {
            cleanupListeners();
        }
        return cleanupListeners;
    } else {
        return new Promise<void>((resolve) => {
            effect = resolve;
            cleanupListeners = observableEffect(fn);
            // If it's already cleanup
            if (isDone) {
                cleanupListeners();
            }
        });
    }
}
