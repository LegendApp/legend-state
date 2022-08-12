import { ObservableListenerDispose, onChange, onChangeShallow, tracking } from '@legendapp/state';

export function listenWhileCalling<T>(fn: () => T, listeners: Set<ObservableListenerDispose>, updateFn: () => void) {
    // Cache previous tracking nodes since this might be nested from another observing component
    const trackingPrev = tracking.nodes;

    // Reset tracking nodes
    tracking.nodes = [];

    // Calling the function fills up the tracking nodes
    const ret = fn();

    const nodes = tracking.nodes;

    // Restore previous tracking nodes
    tracking.nodes = trackingPrev;

    // Listen to any nodes not already listened
    for (let i = 0; i < nodes.length; i++) {
        const { node, shallow } = nodes[i];

        // Listen to this path if not already listening
        if (!node.listeners?.has(updateFn)) {
            listeners.add(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
        }
    }

    return ret;
}
