import { isChildNodeValue, isObject, isString } from './is';
import { NodeValue, TrackingType } from './observableInterfaces';
import { updateTracking } from './tracking';

export const symbolDateModified = /* @__PURE__ */ Symbol('dateModified');
export const symbolIsObservable = Symbol('isObservable');
export const symbolIsEvent = Symbol('isEvent');
export const symbolGetNode = Symbol('getNode');
export const symbolDelete = /* @__PURE__ */ Symbol('delete');
export const symbolOpaque = Symbol('opaque');

export const extraPrimitiveActivators = new Map<string | Symbol, boolean>([
    ['$$typeof', true],
    [Symbol.toPrimitive, true],
]);
export const extraPrimitiveProps = new Map<string | Symbol, any>();

export const nextNodeID = { current: 0 };

export function get(node: NodeValue, track?: TrackingType) {
    // Track by default
    updateTracking(node, track);

    return peek(node);
}

export function peek(node: NodeValue) {
    const root = node.root;
    const activate = root.activate;
    if (activate) {
        root.activate = undefined;
        activate();
    }
    return getNodeValue(node);
}

export function getNodeValue(node: NodeValue): any {
    const arr: (string | number)[] = [];
    let n: NodeValue = node;
    while (isChildNodeValue(n)) {
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
        // This is faster than isNaN
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
        if (isChildNodeValue(node)) {
            const parent = ensureNodeValue(node.parent);
            value = parent[node.key] = {};
        } else {
            value = node.root._ = {};
        }
    }
    return value;
}

export type IDKey = 'id' | '_id' | '__id';
export type IDValue = string | number;

export function findIDKey(obj: unknown | undefined): IDKey | undefined {
    return isObject(obj) ? ('id' in obj ? 'id' : '_id' in obj ? '_id' : '__id' in obj ? '__id' : undefined) : undefined;
}
