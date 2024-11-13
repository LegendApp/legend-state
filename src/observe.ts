import { beginBatch, endBatch } from './batching';
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
        beginBatch();

        // Run the function/selector
        delete e.value;

        // Dispose listeners from previous run
        dispose?.();

        const {
            dispose: _dispose,
            value,
            nodes,
        } = trackSelector(selectorOrRun as Selector<T>, update, undefined, e, options);
        dispose = _dispose;

        e.value = value;
        e.nodes = nodes;
        e.refresh = update;

        if (e.onCleanupReaction) {
            e.onCleanupReaction();
            e.onCleanupReaction = undefined;
        }

        endBatch();

        isRunning = false;

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
