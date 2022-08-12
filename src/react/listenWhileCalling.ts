import { ObservableListenerDispose, onChange, onChangeShallow, tracking } from '@legendapp/state';

export function listenWhileCalling<T>(fn: () => T, listeners: Set<ObservableListenerDispose>, updateFn: () => void) {
    const trackingPrev = tracking.nodes;
    tracking.nodes = [];

    const ret = fn();

    const nodes = tracking.nodes;

    tracking.nodes = trackingPrev;

    for (let i = 0; i < nodes.length; i++) {
        const { node, shallow } = nodes[i];

        // Listen to this path if not already listening
        if (!node.listeners?.has(updateFn)) {
            listeners.add(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
        }
    }

    return ret;
}
