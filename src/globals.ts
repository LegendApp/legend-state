import { isString } from './is';
import { NodeValue } from './observableInterfaces';
import { tracking, updateTracking } from './state';

export const symbolDateModified = Symbol('dateModified');
export const symbolIsObservable = Symbol('isObservable');

export function get(node: NodeValue) {
    let value = getNodeValue(node);
    if (node.root.isPrimitive) {
        value = value.current;
    }
    return value;
}

export function observe(node: NodeValue, shallow?: boolean) {
    const value = get(node);
    if (tracking.nodes) updateTracking(node, value, shallow);
    return value;
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
