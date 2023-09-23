import { beginBatch, endBatch } from './batching';
import { isEvent } from './helpers';
import { isFunction } from './is';
import { Selector } from './observableInterfaces';
import { trackSelector } from './trackSelector';

export interface ObserveEvent<T> {
    num: number;
    previous?: T | undefined;
    cancel?: boolean;
    onCleanup?: () => void;
}

export interface ObserveEventCallback<T> {
    num: number;
    previous?: T | undefined;
    value?: T;
    cancel?: boolean;
    onCleanup?: () => void;
    onCleanupReaction?: () => void;
}

export interface ObserveOptions {
    immediate?: boolean; // Ignore batching and run immediately
    retainObservable?: boolean;
}

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
    const e: ObserveEventCallback<T> = { num: 0 };
    // Wrap it in a function so it doesn't pass all the arguments to run()
    const update = function () {
        if (e.onCleanup) {
            e.onCleanup();
            e.onCleanup = undefined;
        }

        // Run in a batch so changes don't happen until we're done tracking here
        beginBatch();

        // Run the function/selector
        delete e.value;

        // Dispose listeners from previous run
        dispose?.();

        const { dispose: _dispose, value } = trackSelector(selectorOrRun, update, e, options);
        dispose = _dispose;

        e.value = value;

        if (e.onCleanupReaction) {
            e.onCleanupReaction();
            e.onCleanupReaction = undefined;
        }

        endBatch();

        // Call the reaction if there is one and the value changed
        if (reaction && (e.num > 0 || !isEvent(selectorOrRun as any)) && e.previous !== e.value) {
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
