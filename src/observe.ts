import { beginBatch, endBatch } from './batching';
import { symbolIsEvent } from './globals';
import { computeSelector } from './helpers';
import { ObserveEvent, ObserveEventCallback, Selector, TrackingNode } from './observableInterfaces';
import { onChange } from './onChange';
import { beginTracking, endTracking, tracking } from './tracking';

function setupTracking(nodes: Map<number, TrackingNode> | undefined, update: () => void, noArgs?: boolean) {
    let listeners: (() => void)[] | undefined = [];
    // Listen to tracked nodes
    if (nodes) {
        for (let tracked of nodes.values()) {
            const { node, track } = tracked;
            listeners.push(onChange(node, update, track, noArgs));
        }
    }

    return () => {
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                listeners[i]();
            }
            listeners = undefined;
        }
    };
}

export function observe<T>(run: (e: ObserveEvent<T>) => T | void): () => void;
export function observe<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => T | void): () => void;
export function observe<T>(
    selectorOrRun: Selector<T> | ((e: ObserveEvent<T>) => T | void),
    reaction?: (e: ObserveEventCallback<T>) => T | void
) {
    let dispose: () => void;
    const e: ObserveEventCallback<T> = { num: 0 };
    // Wrap it in a function so it doesn't pass all the arguments to run()
    let update = function () {
        // @ts-ignore
        if (e.onCleanup) {
            e.onCleanup();
            e.onCleanup = undefined;
        }

        // Dispose listeners from previous run
        dispose?.();

        // Run in a batch so changes don't happen until we're done tracking here
        beginBatch();

        // Begin tracking observables accessed while running
        beginTracking();

        // Run the function/selector
        delete e.value;
        const previous = e.previous;
        e.previous = computeSelector(selectorOrRun, e);

        if (!e.cancel) {
            const tracker = tracking.current;
            // Do tracing if it was requested
            let noArgs = true;
            if (tracker) {
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
                dispose = setupTracking(tracker.nodes, update, noArgs);
            }
        }

        endTracking();

        if (reaction && (e.num > 0 || !(selectorOrRun as any)[symbolIsEvent]) && previous !== e.previous) {
            e.value = e.previous;
            reaction(e);
        }

        // Increment the counter
        e.num++;

        endBatch();
    };

    update();

    // Return function calling dispose because dispose may be changed in update()
    return () => dispose();
}
