import { effect as observableEffect } from './effect';

export function when(run: () => any): Promise<void>;
export function when(run: () => any, effect: () => void): () => void;
export function when(run: () => any, effect?: () => void) {
    let cleanup: () => void;
    let isDone = false;

    const fn = function () {
        const ret = run();
        if (ret) {
            // If value is truthy then run the effect and cleanup
            isDone = true;
            effect();
            cleanup?.();
        }
    };

    if (effect) {
        cleanup = observableEffect(fn);
        // If it's already cleanup
        if (isDone) {
            cleanup();
        }
        return cleanup;
    } else {
        return new Promise<void>((resolve) => {
            effect = resolve;
            cleanup = observableEffect(fn);
            // If it's already cleanup
            if (isDone) {
                cleanup();
            }
        });
    }
}
