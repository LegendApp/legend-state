import { getNodeValue } from './globals';
import { deconstructObjectWithPath } from './helpers';
import { dispatchMiddlewareEvent } from './middleware';
import type {
    LinkedOptions,
    ListenerFn,
    ListenerParams,
    NodeInfo,
    NodeListener,
    TrackingType,
} from './observableInterfaces';

export function isSyncedObservable(node: NodeInfo): boolean {
    // type patched, should we add it to the LinkedOptions?
    return (node.activationState as LinkedOptions & { synced?: true })?.synced || false;
}

export function onChange(
    node: NodeInfo,
    callback: ListenerFn,
    options: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean } = {},
    fromLinks?: Set<NodeInfo>,
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

    const listener: NodeListener = {
        listener: callback,
        track: trackingType,
        noArgs,
    };

    listeners.add(listener);

    if (initial) {
        const value = getNodeValue(node);
        callback({
            value,
            isFromPersist: true,
            isFromSync: false,
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

    let extraDisposes: (() => void)[];

    function addLinkedNodeListeners(childNode: NodeInfo, cb: ListenerFn = callback, from?: NodeInfo) {
        // Don't add listeners for the same node more than once
        if (!fromLinks?.has(childNode)) {
            fromLinks ||= new Set();
            fromLinks.add(from || node);
            cb ||= callback;
            const childOptions: Parameters<typeof onChange>[2] = {
                trackingType: true,
                ...options,
            };
            // onChange for the linked node
            extraDisposes = [...(extraDisposes || []), onChange(childNode, cb as ListenerFn, childOptions, fromLinks)];
        }
    }

    // Add listeners for linked to nodes
    if (node.linkedToNode) {
        addLinkedNodeListeners(node.linkedToNode);
    }

    // Add listeners for linked from nodes
    node.linkedFromNodes?.forEach((linkedFromNode) => addLinkedNodeListeners(linkedFromNode));

    // Go up through the parents and add listeners for linked from nodes
    node.numListenersRecursive++;
    let parent = node.parent;
    let pathParent: string[] = [node!.key!];

    while (parent) {
        if (parent.linkedFromNodes) {
            for (const linkedFromNode of parent.linkedFromNodes) {
                if (!fromLinks?.has(linkedFromNode)) {
                    const cb = createCb(linkedFromNode, pathParent, callback);
                    addLinkedNodeListeners(linkedFromNode, cb, parent);
                }
            }
        }
        parent.numListenersRecursive++;

        if (!parent.listeners && !parent.listenersImmediate && isSyncedObservable(parent)) {
            dispatchMiddlewareEvent(parent, undefined, 'listener-added');
        }

        pathParent = [parent!.key!, ...pathParent];
        parent = parent.parent;
    }

    // Queue middleware event for listener added
    dispatchMiddlewareEvent(node, listener, 'listener-added');

    return () => {
        // Remove the listener from the set
        listeners.delete(listener);

        // Clean up linked node listeners
        extraDisposes?.forEach((fn) => fn());

        // Update listener counts up the tree and track nodes that became fully cleared
        const clearedRecursive: NodeInfo[] = [];
        let parent: NodeInfo | undefined = node;
        while (parent) {
            parent.numListenersRecursive--;
            if (parent.numListenersRecursive === 0) {
                clearedRecursive.push(parent);
            }
            parent = parent.parent!;
        }
        // Queue middleware event for listener removed
        dispatchMiddlewareEvent(node, listener, 'listener-removed');
        // If there are no more listeners in this set, queue the listeners-cleared event
        if (listeners.size === 0) {
            dispatchMiddlewareEvent(node, undefined, 'listeners-cleared');
        }

        for (const clearedNode of clearedRecursive) {
            // Dispatch listeners-cleared for all cleared nodes
            if (clearedNode !== node) {
                dispatchMiddlewareEvent(clearedNode, undefined, 'listeners-cleared');
            }
        }
    };
}

function createCb(linkedFromNode: NodeInfo, path: string[], callback: ListenerFn) {
    // Create a callback for a path that calls it with the current value at the path
    let prevAtPath = deconstructObjectWithPath(path, [], getNodeValue(linkedFromNode));

    return function ({ value: valueA, isFromPersist, isFromSync }: ListenerParams<any>) {
        const valueAtPath = deconstructObjectWithPath(path, [], valueA);
        if (valueAtPath !== prevAtPath) {
            callback({
                value: valueAtPath,
                isFromPersist,
                isFromSync,
                changes: [
                    {
                        path: [],
                        pathTypes: [],
                        prevAtPath,
                        valueAtPath,
                    },
                ],
                getPrevious: () => prevAtPath,
            });
        }
        prevAtPath = valueAtPath;
    };
}
