import { isChildNodeValue, isFunction, isObject } from './is';
import { NodeValue, TrackingType } from './observableInterfaces';
import { updateTracking } from './tracking';

export const symbolIsObservable = Symbol('isObservable');
export const symbolIsEvent = Symbol('isEvent');
export const symbolGetNode = Symbol('getNode');
export const symbolDelete = /* @__PURE__ */ Symbol('delete');
export const symbolOpaque = Symbol('opaque');

export const extraPrimitiveActivators = new Map<string | symbol, boolean>();
export const extraPrimitiveProps = new Map<string | symbol, any>();

export function checkActivate(node: NodeValue) {
    const root = node.root;
    const activate = root.activate;
    if (activate) {
        root.activate = undefined;
        activate();
    }
}

export function get(node: NodeValue, track?: TrackingType) {
    // Track by default
    updateTracking(node, track);

    return peek(node);
}

export function peek(node: NodeValue) {
    checkActivate(node);
    return getNodeValue(node);
}

const arrNodeKeys: string[] = [];
export function getNodeValue(node: NodeValue): any {
    let count = 0;
    let n: NodeValue = node;
    while (isChildNodeValue(n)) {
        arrNodeKeys[count++] = n.key;
        n = n.parent;
    }
    let child = node.root._;
    for (let i = count - 1; child && i >= 0; i--) {
        child = child[arrNodeKeys[i]];
    }
    return child;
}

export function getChildNode(node: NodeValue, key: string): NodeValue {
    // Get the child by key
    let child = node.children?.get(key);

    // Create the child node if it doesn't already exist
    if (!child) {
        child = {
            root: node.root,
            parent: node,
            key,
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

export function findIDKey(obj: unknown | undefined, node: NodeValue): string | ((value: any) => string) {
    let idKey: string | ((value: any) => string) = isObject(obj)
        ? 'id' in obj
            ? 'id'
            : 'key' in obj
            ? 'key'
            : '_id' in obj
            ? '_id'
            : '__id' in obj
            ? '__id'
            : undefined
        : undefined;

    // let idKey = isObject(obj) && ('id' in obj ? 'id' : 'key' in obj ? 'key' : undefined);
    if (!idKey && node.parent) {
        const keyExtractor = getNodeValue(node.parent)[node.key + '_keyExtractor'] as (value: any) => string;
        if (keyExtractor && isFunction(keyExtractor)) {
            idKey = keyExtractor;
        }
    }

    return idKey;
}
