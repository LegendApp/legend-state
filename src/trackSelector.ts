import { computeSelector } from './helpers';
import type { ObserveOptions, ListenerParams, ObserveEvent, Selector, GetOptions } from './observableInterfaces';
import { setupTracking } from './setupTracking';
import { beginTracking, endTracking, tracking } from './tracking';

export function trackSelector<T>(
    selector: Selector<T>,
    update: (params: ListenerParams) => void,
    getOptions?: GetOptions,
    observeEvent?: ObserveEvent<T>,
    observeOptions?: ObserveOptions,
    createResubscribe?: boolean,
) {
    let dispose: undefined | (() => void);
    let resubscribe: (() => () => void) | undefined;
    let updateFn = update;

    beginTracking();
    const value = selector
        ? computeSelector(selector, getOptions, observeEvent, observeOptions?.fromComputed)
        : selector;
    const tracker = tracking.current;
    const nodes = tracker!.nodes;
    endTracking();

    if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && tracker && nodes) {
        tracker.traceListeners?.(nodes);
        if (tracker.traceUpdates) {
            updateFn = tracker.traceUpdates(update) as () => void;
        }
        // Clear tracing so it doesn't leak to other components
        tracker.traceListeners = undefined;
        tracker.traceUpdates = undefined;
    }

    if (!observeEvent?.cancel) {
        // Do tracing if it was requested

        // useSyncExternalStore doesn't subscribe until after the component mount.
        // We want to subscribe immediately so we don't miss any updates
        dispose = setupTracking(nodes, updateFn, false, observeOptions?.immediate);
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            resubscribe = createResubscribe
                ? () => {
                      dispose?.();
                      dispose = setupTracking(nodes, updateFn);
                      return dispose;
                  }
                : undefined;
        }
    }

    return { nodes, value, dispose, resubscribe };
}
