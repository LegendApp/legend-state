import { ObserveOptions } from 'src/observe';
import { computeSelector } from './helpers';
import { isObservable } from './is';
import type { ObserveEvent, Selector } from './observableInterfaces';
import { setupTracking } from './setupTracking';
import { beginTracking, endTracking, tracking } from './tracking';

export function trackSelector<T>(
    selector: Selector<T>,
    update: () => void,
    observeEvent?: ObserveEvent<T>,
    observeOptions?: ObserveOptions,
    createResubscribe?: boolean
) {
    let nodes;
    let value;
    let dispose;
    let tracker;
    let resubscribe: () => void;
    let updateFn = update;
    let noArgs = true;

    if (isObservable(selector)) {
        value = selector.peek();
        dispose = selector.onChange(update, { noArgs: true });
        resubscribe = createResubscribe && selector.onChange(update, { noArgs: true });
    } else {
        // Compute the selector inside a tracking context
        beginTracking();
        value = selector ? computeSelector(selector, observeEvent, observeOptions?.retainObservable) : selector;
        tracker = tracking.current;
        nodes = tracker.nodes;
        endTracking();

        if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && tracker && nodes) {
            tracker.traceListeners?.(nodes);
            if (tracker.traceUpdates) {
                noArgs = false;
                updateFn = tracker.traceUpdates(update) as () => void;
            }
            // Clear tracing so it doesn't leak to other components
            tracker.traceListeners = undefined;
            tracker.traceUpdates = undefined;
        }
    }

    if (!observeEvent?.cancel) {
        // Do tracing if it was requested

        // useSyncExternalStore doesn't subscribe until after the component mount.
        // We want to subscribe immediately so we don't miss any updates
        dispose = setupTracking(nodes, updateFn, noArgs, observeOptions?.immediate);
        resubscribe = createResubscribe && (() => setupTracking(nodes, updateFn, noArgs));
    }

    return { value, dispose, resubscribe };
}
