import { checkActivate, getNodeValue } from './globals';
import type { ListenerFn, NodeValue, NodeValueListener } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn,
    options: { shallow?: boolean; initial?: boolean; immediate?: boolean; noArgs?: boolean } = {},
): () => void {
    const { initial, immediate, noArgs } = options;
    const { shallow } = options;

    let listeners = immediate ? node.listenersImmediate : node.listeners;
    if (!listeners) {
        listeners = new Set();
        if (immediate) {
            node.listenersImmediate = listeners;
        } else {
            node.listeners = listeners;
        }
    }
    checkActivate(node);

    const listener: NodeValueListener = {
        listener: callback,
        shallow,
        noArgs,
    };

    listeners.add(listener);

    let parent = node;
    while (parent && !parent.descendantHasListener) {
        parent.descendantHasListener = true;
        parent = parent.parent!;
    }

    if (initial) {
        const value = getNodeValue(node);
        callback({
            value,
            changes: [
                {
                    path: [],
                    pathTypes: [],
                    prevAtPath: value,
                    valueAtPath: value,
                },
            ],
            getPrevious: () => undefined,
        });
    }

    return () => listeners!.delete(listener);
}
