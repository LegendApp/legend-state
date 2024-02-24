import { getNodeValue } from './globals';
import { getValueAtPath } from './helpers';
import type { ListenerFn, ListenerParams, NodeValue, NodeValueListener, TrackingType } from './observableInterfaces';

export function onChange(
    node: NodeValue,
    callback: ListenerFn,
    options: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean } = {},
    fromLinks?: Set<NodeValue>,
): () => void {
    const { initial, immediate, noArgs } = options;
    const { trackingType } = options;

    let listeners = immediate ? node.listenersImmediate : node.listeners;
    if (!listeners) {
        listeners = new Set();
        if (immediate) {
            node.listenersImmediate = listeners;
        } else {
            node.listeners = listeners;
        }
    }

    const listener: NodeValueListener = {
        listener: callback,
        track: trackingType,
        noArgs,
    };

    listeners.add(listener);

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

    // TODO: This is really verbose, refactor it to be less code. But for now at least it's correct.
    let extraDisposes: (() => void)[];
    if (node.linkedToNode) {
        if (!fromLinks || !fromLinks.has(node.linkedToNode)) {
            fromLinks ||= new Set();
            fromLinks.add(node);
            fromLinks.add(node.linkedToNode);
            extraDisposes = [onChange(node.linkedToNode, callback, options, fromLinks)];
        }
    }
    // TODO: Need to go up through parents find linked nodes and onChange their nodes at the same path
    if (node.linkedFromNodes) {
        for (const linkedFromNode of node.linkedFromNodes) {
            if (!fromLinks || !fromLinks.has(linkedFromNode)) {
                fromLinks ||= new Set();
                fromLinks.add(node);
                fromLinks.add(linkedFromNode);
                extraDisposes ||= [];
                extraDisposes.push(onChange(linkedFromNode, callback, options, fromLinks));
            }
        }
    }
    let parent = node.parent;
    let pathParent: string[] = [node!.key!];
    while (parent) {
        if (parent.linkedFromNodes) {
            for (const linkedFromNode of parent.linkedFromNodes) {
                if (!fromLinks || !fromLinks.has(linkedFromNode)) {
                    fromLinks ||= new Set();
                    fromLinks.add(parent);
                    fromLinks.add(linkedFromNode);
                    extraDisposes ||= [];
                    const path = pathParent;
                    const p = getValueAtPath(getNodeValue(linkedFromNode), path);
                    const prev = p ? JSON.parse(JSON.stringify(p)) : {};

                    const cb = ({ value: valueA }: ListenerParams<any>) => {
                        const value = getValueAtPath(valueA, path);
                        if (value !== prev) {
                            callback({
                                value,
                                changes: [
                                    {
                                        path,
                                        pathTypes: path.map(() => 'object'), // TODO CHANGE
                                        prevAtPath: prev,
                                        valueAtPath: value,
                                    },
                                ],
                                getPrevious: () => prev,
                            });
                        }
                    };
                    extraDisposes.push(onChange(linkedFromNode, cb, { trackingType: true, ...options }, fromLinks));
                }
            }
        }
        pathParent = [parent!.key!, ...pathParent];
        parent = parent.parent;
    }

    return () => {
        listeners!.delete(listener);
        extraDisposes?.forEach((fn) => fn());
    };
}
