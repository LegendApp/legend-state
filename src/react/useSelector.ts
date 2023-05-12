import {
    beginTracking,
    computeSelector,
    endTracking,
    isObservable,
    Selector,
    setupTracking,
    tracking,
} from '@legendapp/state';
import { useRef } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

interface SelectorFunctions<T> {
    subscribe: (onStoreChange: () => void) => void;
    getVersion: () => number;
    run: (selector: Selector<T>) => T;
}

function createSelectorFunctions<T>(): SelectorFunctions<T> {
    let version = 0;
    let notify: () => void;
    let dispose: () => void;
    let resubscribe: () => void;

    const _update = () => {
        version++;
        notify?.();
    };

    return {
        subscribe: (onStoreChange: () => void) => {
            notify = onStoreChange;

            // Workaround for React 18 running twice in dev (part 2)
            if (
                (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
                !dispose &&
                resubscribe
            ) {
                resubscribe();
            }

            return () => {
                dispose?.();
                dispose = undefined;
            };
        },
        getVersion: () => version,
        run: (selector: Selector<T>) => {
            let value: T;
            // Dispose if already listening
            dispose?.();

            if (isObservable(selector)) {
                // Fast path for useSelector just accessing an observable directly. We don't need to do all the
                // tracking context management, can just onChange the observable directly.
                value = selector.get();
                dispose = selector.onChange(_update, { noArgs: true });
            } else {
                // Compute the selector inside a tracking context
                beginTracking();
                value = selector ? computeSelector(selector) : selector;
                const tracker = tracking.current;
                const { nodes } = tracker;
                endTracking();

                let noArgs = true;
                let update = _update;
                // Do tracing if it was requested
                if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && tracker && nodes) {
                    tracker.traceListeners?.(nodes);
                    if (tracker.traceUpdates) {
                        noArgs = false;
                        update = tracker.traceUpdates(_update) as () => void;
                    }
                    // Clear tracing so it doesn't leak to other components
                    tracker.traceListeners = undefined;
                    tracker.traceUpdates = undefined;
                }

                // useSyncExternalStore doesn't subscribe until after the component mount.
                // We want to subscribe immediately so we don't miss any updates
                dispose = setupTracking(nodes, update, noArgs);

                // Workaround for React 18 running twice in dev (part 1)
                if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                    resubscribe = () => setupTracking(nodes, update, noArgs);
                }
            }

            return value;
        },
    };
}

export function useSelector<T>(selector: Selector<T>): T {
    const ref = useRef<SelectorFunctions<T>>();
    if (!ref.current) {
        ref.current = createSelectorFunctions<T>();
    }
    const { subscribe, getVersion, run } = ref.current;

    const value = run(selector);

    useSyncExternalStore(subscribe, getVersion, getVersion);

    return value;
}
