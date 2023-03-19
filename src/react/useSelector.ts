import { beginTracking, computeSelector, endTracking, Selector, setupTracking, tracking } from '@legendapp/state';
import { useRef } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

export function useSelector<T>(selector: Selector<T>): T {
    const ref = useRef<{ version: number; value?: T; notify?: () => void; update?: () => void; dispose?: () => void }>({
        version: 0,
    });

    if (!selector) return selector as T;

    const current = ref.current;

    // Compute the selector inside a tracking context
    beginTracking();
    current.value = computeSelector(selector);
    const tracker = tracking.current;
    const { nodes } = tracker;
    endTracking();

    let noArgs = true;
    if (!current.update) {
        current.update = () => {
            current.version++;
            current.notify?.();
        };
        // Do tracing if it was requested
        if (process.env.NODE_ENV === 'development' && tracker && nodes) {
            tracker.traceListeners?.(nodes);
            if (tracker.traceUpdates) {
                noArgs = false;
                current.update = tracker.traceUpdates(current.update) as () => void;
            }
            // Clear tracing so it doesn't leak to other components
            tracker.traceListeners = undefined;
            tracker.traceUpdates = undefined;
        }
    }

    // Dispose if already listening
    current.dispose?.();
    // useSyncExternalStore doesn't subscribe until after the component mount.
    // We want to subscribe immediately so we don't miss any updates
    current.dispose = setupTracking(nodes, current.update, noArgs);

    // Returning a version number lets us have mutable values. When we know an observable
    // is updated we increment the value so that the useSyncExternalStore updates with the new value.
    const getVersion = () => current.version;

    useSyncExternalStore(
        (onStoreChange: () => void) => {
            const current = ref.current;
            current.notify = onStoreChange;
            // Listen if not already listening
            if (!current.dispose) {
                current.dispose = setupTracking(nodes, current.update, noArgs);
            }

            return () => {
                current.dispose?.();
                current.dispose = undefined;
            };
        },
        getVersion,
        getVersion
    );

    return current.value;
}
