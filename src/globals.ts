import { isObject, isString } from './is';
import { NodeValue, TrackingType } from './observableInterfaces';
import { updateTracking } from './tracking';

export const symbolDateModified = Symbol('dateModified');
export const symbolIsObservable = Symbol('isObservable');
export const symbolIsEvent = Symbol('isEvent');
export const symbolGetNode = Symbol('getNode');
export const symbolUndef = Symbol('undef');
export const symbolDelete = Symbol('delete');

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
    if (root.activate) {
        root.activate();
        root.activate = undefined;
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
        if (node.parent) {
            const parent = ensureNodeValue(node.parent);
            value = parent[node.key] = {};
        } else {
            value = node.root._ = {};
        }
    }
    return value;
}

if (process.env.NODE_ENV === 'development') {
    var hasLogged: Record<string, true> = {};
}
export function shouldTreatAsOpaque(value: any) {
    if (isObject(value)) {
        // It's a DOM element
        if (typeof value.nodeType === 'number' && typeof value.nodeName === 'string') {
            if (process.env.NODE_ENV === 'development' && !hasLogged.dom) {
                console.warn('[legend-state] Detected DOM element in an observable which is likely an error');
                hasLogged.dom = true;
            }
            return true;
        }
        // It's a React JSX element
        if (value.$$typeof) {
            if (process.env.NODE_ENV === 'development' && !hasLogged.jsx) {
                console.warn(
                    `[legend-state] Detected a React element in an observable which is likely an error. It's more effective to put small data objects in observables which React elements use to render.`
                );
                hasLogged.jsx = true;
            }
            return true;
        }
    }
}
