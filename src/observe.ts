import { beginBalancedBatch, endBatch, endBatchAndThrow } from './batching';
import { isEvent } from './globals';
import { isFunction } from './is';
import type { ObserveEvent, ObserveEventCallback, ObserveOptions, Selector } from './observableInterfaces';
import { trackSelector } from './trackSelector';

export function observe<T>(run: (e: ObserveEvent<T>) => T | void, options?: ObserveOptions): () => void;
export function observe<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: ObserveOptions,
): () => void;
export function observe<T>(
    selectorOrRun: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | ObserveOptions,
    options?: ObserveOptions,
) {
    let reaction: (e: ObserveEventCallback<T>) => any;
    if (isFunction(reactionOrOptions)) {
        reaction = reactionOrOptions;
    } else {
        options = reactionOrOptions;
    }
    let dispose: (() => void) | undefined;
    let isRunning = false;
    const e: ObserveEventCallback<T> = { num: 0 } as ObserveEventCallback<T>;
    // Wrap it in a function so it doesn't pass all the arguments to run()
    const update = function () {
        if (isRunning) {
            // Prevent observe from triggering itself when it activates a node
            return;
        }

        if (e.onCleanup) {
            e.onCleanup();
            e.onCleanup = undefined;
        }

        isRunning = true;

        // Run in a batch so changes don't happen until we're done tracking here
        beginBalancedBatch();
        try {
            try {
                // Run the function/selector
                delete e.value;

                const tracked = trackSelector(
                    selectorOrRun as Selector<T>,
                    update,
                    undefined,
                    e,
                    options,
                    undefined,
                    dispose,
                );
                dispose = tracked.dispose;

                e.value = tracked.value;
                e.nodes = tracked.nodes;
                e.refresh = update;

                if (e.onCleanupReaction) {
                    e.onCleanupReaction();
                    e.onCleanupReaction = undefined;
                }
            } catch (error) {
                endBatchAndThrow(error);
            }
            endBatch();
        } finally {
            isRunning = false;
        }

        // Call the reaction if there is one and the value changed
        if (
            reaction &&
            (options?.fromComputed ||
                ((e.num > 0 || !isEvent(selectorOrRun as any)) &&
                    (e.previous !== e.value || typeof e.value === 'object')))
        ) {
            reaction(e);
        }

        // Update the previous value
        e.previous = e.value;

        // Increment the counter
        e.num++;
    };

    update();

    // Return function calling dispose because dispose may be changed in update()
    return () => {
        e.onCleanup?.();
        e.onCleanup = undefined;
        e.onCleanupReaction?.();
        e.onCleanupReaction = undefined;
        dispose?.();
    };
}
