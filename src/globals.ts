import { isChildNodeValue, isFunction, isObject } from './is';
import { NodeValue, ObservableReadable, TrackingType } from './observableInterfaces';
import { updateTracking } from './tracking';

export const symbolToPrimitive = Symbol.toPrimitive;
export const symbolGetNode = Symbol('getNode');
export const symbolDelete = /* @__PURE__ */ Symbol('delete');
export const symbolOpaque = Symbol('opaque');
export const optimized = Symbol('optimized');

export const extraPrimitiveActivators = new Map<string | symbol, boolean>();
export const extraPrimitiveProps = new Map<string | symbol, any>();

export const __devExtractFunctionsAndComputedsNodes =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? new Set() : undefined;

export function checkActivate(node: NodeValue) {
    const root = node.root;
    root.activate?.();
}

export function getNode(obs: ObservableReadable): NodeValue {
    return obs && (obs as any)[symbolGetNode];
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

export function setNodeValue(node: NodeValue, newValue: any) {
    const parentNode = node.parent ?? node;
    const key = node.parent ? node.key : '_';

    const isDelete = newValue === symbolDelete;
    if (isDelete) newValue = undefined;

    // Get the value of the parent
    // const parentValue = isRoot ? node.root : ensureNodeValue(node);
    const parentValue = node.parent ? ensureNodeValue(parentNode) : parentNode.root;

    // Save the previous value first
    const prevValue = parentValue[key];

    const isFunc = isFunction(newValue);

    // Compute newValue if newValue is a function or an observable
    newValue =
        !parentNode.isAssigning && isFunc
            ? newValue(prevValue)
            : isObject(newValue) && newValue?.[symbolGetNode as any]
            ? newValue.peek()
            : newValue;

    try {
        parentNode.isSetting = (parentNode.isSetting || 0) + 1;

        // Save the new value
        if (isDelete) {
            delete parentValue[key];
        } else {
            parentValue[key] = newValue;
        }
    } finally {
        parentNode.isSetting!--;
    }

    if (parentNode.root.locked && parentNode.root.set) {
        parentNode.root.set(parentNode.root._);
    }

    return { prevValue, newValue };
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
        const key = arrNodeKeys[i] as any;
        child = child instanceof Map || child instanceof WeakMap ? child.get(key) : child[key];
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

export function findIDKey(obj: unknown | undefined, node: NodeValue): string | ((value: any) => string) | undefined {
    let idKey: string | ((value: any) => string) | undefined = isObject(obj)
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

    if (!idKey && node.parent) {
        const keyExtractor = getNodeValue(node.parent)[node.key + '_keyExtractor'] as (value: any) => string;
        if (keyExtractor && isFunction(keyExtractor)) {
            idKey = keyExtractor;
        }
    }

    return idKey;
}

export function extractFunction(node: NodeValue, value: Record<string, any>, key: string) {
    if (!node.functions) {
        node.functions = new Map();
    }
    node.functions.set(key, value[key]);
}

export function extractFunctionsAndComputeds(obj: Record<string, any>, node: NodeValue) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        if (__devExtractFunctionsAndComputedsNodes!.has(obj)) {
            console.error(
                '[legend-state] Circular reference detected in object. You may want to use opaqueObject to stop traversing child nodes.',
                obj,
            );
            return false;
        }
        __devExtractFunctionsAndComputedsNodes!.add(obj);
    }
    for (const k in obj) {
        const v = obj[k];
        if (typeof v === 'function') {
            extractFunction(node, obj, k);
        } else if (typeof v == 'object' && v !== null && v !== undefined) {
            const childNode = getNode(v);
            if (childNode?.isComputed) {
                extractFunction(node, obj, k);
            } else if (!v[symbolOpaque]) {
                extractFunctionsAndComputeds(obj[k], getChildNode(node, k));
            }
        }
    }
}
