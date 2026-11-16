import { computeSelector } from './helpers';
import type { ObserveOptions, ListenerParams, ObserveEvent, Selector, GetOptions } from './observableInterfaces';
import { setupTracking, type TrackingSubscriptions } from './setupTracking';
import { beginTracking, endTracking, tracking } from './tracking';

export function trackSelector<T>(
    selector: Selector<T>,
    update: (params: ListenerParams) => void,
    getOptions?: GetOptions,
    observeEvent?: ObserveEvent<T>,
    observeOptions?: ObserveOptions,
    createResubscribe?: boolean,
    previous?: { dispose?: () => void; subscriptions?: TrackingSubscriptions },
) {
    let dispose: undefined | (() => void);
    let subscriptions: TrackingSubscriptions | undefined;
    let resubscribe: (() => () => void) | undefined;
    let updateFn = update;

    let value: T;
    beginTracking();
    const tracker = tracking.current;
    try {
        value = selector ? computeSelector(selector, getOptions, observeEvent, observeOptions?.fromComputed) : selector;
    } finally {
        endTracking();
    }
    const nodes = tracker!.nodes;

    if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && tracker && nodes) {
        tracker.traceListeners?.(nodes);
        if (tracker.traceUpdates) {
            updateFn = tracker.traceUpdates(update) as () => void;
        }
        // Clear tracing so it doesn't leak to other components
        tracker.traceListeners = undefined;
        tracker.traceUpdates = undefined;
    }

    // Keep previous listeners if tracking throws. Untraced listeners can be reused by an untraced run.
    if (observeEvent?.cancel || updateFn !== update || !previous?.subscriptions) {
        previous?.dispose?.();
        previous = undefined;
    }

    if (!observeEvent?.cancel) {
        // Do tracing if it was requested

        // useSyncExternalStore doesn't subscribe until after the component mount.
        // We want to subscribe immediately so we don't miss any updates
        ({ dispose, subscriptions } = setupTracking(
            nodes,
            updateFn,
            false,
            observeOptions?.immediate,
            previous?.subscriptions,
        ));
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            resubscribe = createResubscribe
                ? () => {
                      dispose?.();
                      dispose = setupTracking(nodes, updateFn).dispose;
                      return dispose;
                  }
                : undefined;
        }
    }

    // Traced listeners wrap the update, so they are never reused
    if (updateFn !== update) subscriptions = undefined;

    return { nodes, value, dispose, subscriptions, resubscribe };
}
