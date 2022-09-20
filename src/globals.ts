import { updateTracking } from './tracking';
import { isString } from './is';
import { NodeValue, TrackingType } from './observableInterfaces';

export const symbolDateModified = Symbol('dateModified');
export const symbolIsObservable = Symbol('isObservable');
export const symbolGetNode = Symbol('getNode');
export const symbolUndef = Symbol('undef');

export const extraPrimitiveProps = new Map<string, any>();

export const nextNodeID = { current: 0 };

export function get(node: NodeValue, track?: TrackingType) {
    if (track !== false) {
        // Track by default
        updateTracking(node, track);
    }

    return peek(node);
}

export function peek(node: NodeValue) {
    if (node.activate) {
        node.activate();
        node.activate = undefined;
    }
    return getNodeValue(node);
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

export function ensureNodeValue(node: NodeValue) {
    let value = getNodeValue(node);
    if (!value) {
        const parent = ensureNodeValue(node.parent);
        value = parent[node.key] = {};
    }
    return value;
}
