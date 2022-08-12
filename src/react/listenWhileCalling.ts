import { tracking, ObservableListenerDispose, TrackingNode, onChangeShallow, onChange } from '@legendapp/state';

export function listenWhileCalling<T>(fn: () => T, listeners: Set<ObservableListenerDispose>, updateFn: () => void) {
    const trackingPrev = tracking.nodes;
    // tracking.is = true;
    tracking.nodes = [];

    let ret = fn();

    const nodes = tracking.nodes;

    // tracking.is = false;

    tracking.nodes = trackingPrev;

    const listenersNotSeen = new Set<ObservableListenerDispose>();
    for (let i = 0; i < nodes.length; i++) {
        const { node, shallow } = nodes[i];

        // Listen to this path if not already listening
        if (!node.listeners?.has(updateFn)) {
            listeners.add(shallow ? onChangeShallow(node, updateFn) : onChange(node, updateFn));
        } else {
            listenersNotSeen.delete(updateFn);
        }
    }

    for (let dispose of listenersNotSeen) {
        listeners.delete(dispose);
        dispose();
    }

    return ret;
}
