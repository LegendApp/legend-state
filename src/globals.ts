import { isBoolean, isString } from './is';
import { NodeValue, Tracking } from './observableInterfaces';
import { tracking, untrack, updateTracking } from './tracking';

export const symbolDateModified = Symbol('dateModified');
export const symbolIsObservable = Symbol('isObservable');

export const nextNodeID = { current: 0 };

export function checkTracking(node: NodeValue, track: boolean | Tracking) {
    if (tracking.nodes) {
        if (track) {
            updateTracking(
                node,
                undefined,
                isBoolean(track) ? (track ? Tracking.Shallow : Tracking.Normal) : track,
                /*manual*/ true
            );
        } else {
            untrack(node);
        }
    }
}

export function get(node: NodeValue, keyOrTrack?: string | number | boolean | Tracking, track?: boolean | Tracking) {
    if (arguments.length === 2) {
        track = keyOrTrack as boolean | Tracking;
        keyOrTrack = undefined;
    }

    // Track by default
    checkTracking(node, track || track === undefined);

    const value = getOutputValue(node);
    return keyOrTrack ? value?.[keyOrTrack as string | number] : value;
}

export function getNodeValue(node: NodeValue): any {
    const arr: (string | number)[] = [];
    let n = node;
    while (n?.key !== undefined) {
        arr.push(n.key);
        n = n.parent;
    }
    let child = node.root._;
    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] !== undefined && child) {
            child = child[arr[i]];
        }
    }
    return child;
}

export function getOutputValue(node: NodeValue) {
    let value = getNodeValue(node);
    if (node.root.isPrimitive) {
        value = value.current;
    }
    return value;
}

export function getChildNode(node: NodeValue, key: string | number): NodeValue {
    if (isString(key)) {
        const n = +key;
        // Convert to number if it's a string representing a valid number
        if (n - n < 1) key = n;
    }

    // Get the child by id if included, or by key
    let child = node.children?.get(key);

    // Create the child node if it doesn't already exist
    if (!child) {
        child = {
            id: nextNodeID.current++,
            root: node.root,
            parent: node,
            key,
            // id,
        };
        if (!node.children) {
            node.children = new Map();
        }
        node.children.set(key, child);
    }

    return child;
}
