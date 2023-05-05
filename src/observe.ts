import { beginBatch, endBatch } from './batching';
import { symbolIsEvent } from './globals';
import { computeSelector } from './helpers';
import { isFunction } from './is';
import { ObserveEvent, ObserveEventCallback, Selector } from './observableInterfaces';
import { setupTracking } from './setupTracking';
import { beginTracking, endTracking, tracking } from './tracking';

export interface ObserveOptions {
    immediate?: boolean; // Ignore batching and run immediately
}

export function observe<T>(run: (e: ObserveEvent<T>) => T | void, options?: ObserveOptions): () => void;
export function observe<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: ObserveOptions
): () => void;
export function observe<T>(
    selectorOrRun: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | ObserveOptions,
    options?: ObserveOptions
) {
    let reaction: (e: ObserveEventCallback<T>) => any;
    if (isFunction(reactionOrOptions)) {
        reaction = reactionOrOptions;
    } else {
        options = reactionOrOptions;
    }
    let dispose: () => void;
    const e: ObserveEventCallback<T> = { num: 0 };
    // Wrap it in a function so it doesn't pass all the arguments to run()
    let update = function () {
        if (e.onCleanup) {
            e.onCleanup();
            e.onCleanup = undefined;
        }

        // Run in a batch so changes don't happen until we're done tracking here
        beginBatch();

        // Begin tracking observables accessed while running
        beginTracking();

        // Run the function/selector
        delete e.value;
        e.value = computeSelector(selectorOrRun, e);

        // Dispose listeners from previous run
        dispose?.();

        if (!e.cancel) {
            const tracker = tracking.current;
            let noArgs = true;
            if (tracker) {
                // Do tracing if it was requested
                if (process.env.NODE_ENV === 'development' && tracker.nodes) {
                    tracker.traceListeners?.(tracker.nodes);
                    if (tracker.traceUpdates) {
                        noArgs = false;
                        update = tracker.traceUpdates(update) as () => void;
                    }
                    // Clear tracing
                    tracker.traceListeners = undefined;
                    tracker.traceUpdates = undefined;
                }

                // Setup tracking with the nodes that were accessed
                dispose = setupTracking(tracker.nodes, update, noArgs, options?.immediate);
            }
        }

        endTracking();

        if (e.onCleanupReaction) {
            e.onCleanupReaction();
            e.onCleanupReaction = undefined;
        }

        // Call the reaction if there is one and the value changed
        if (reaction && (e.num > 0 || !(selectorOrRun as any)[symbolIsEvent]) && e.previous !== e.value) {
            reaction(e);
        }

        // Update the previous value
        e.previous = e.value;

        // Increment the counter
        e.num++;

        endBatch();
    };

    update();

    // Return function calling dispose because dispose may be changed in update()
    return () => {
        e.onCleanup?.();
        e.onCleanup = undefined;
        e.onCleanupReaction?.();
        e.onCleanupReaction = undefined;
        dispose();
    };
}
