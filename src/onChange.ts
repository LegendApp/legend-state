import { ListenerFn, ListenerInfo, NodeValue } from './observableInterfaces';
import { tracking } from './tracking';

export function onChange(
    node: NodeValue,
    callback: ListenerFn<any>,
    track?: boolean | Symbol,
    noArgs?: boolean,
    markAndSweep?: boolean
): () => void {
    let listeners = node.listeners;
    if (!listeners) {
        node.listeners = listeners = new Set();
    }

    let dispose: () => void;
    let listener: ListenerInfo;
    let c = callback;
    if (markAndSweep) {
        c = function () {
            tracking.callbacksMarked.add(dispose);
            callback();
        };
    }

    listener = { listener: c, track: track, noArgs };

    listeners.add(listener);

    return (dispose = () => {
        if (markAndSweep) {
            tracking.callbacksMarked.delete(dispose);
        }
        listeners.delete(listener);
    });
}
