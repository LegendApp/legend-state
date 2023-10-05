import { isChildNodeValue, isFunction, isObject } from './is';
import { NodeValue, ObservableComputed, ObservableReadable } from './observableInterfaces';

export const symbolToPrimitive = Symbol.toPrimitive;
export const symbolGetNode = Symbol('getNode');
export const symbolDelete = /* @__PURE__ */ Symbol('delete');
export const symbolOpaque = Symbol('opaque');
export const optimized = Symbol('optimized');

// TODOV3 Remove these
export const extraPrimitiveActivators = new Map<string | symbol, boolean>();
export const extraPrimitiveProps = new Map<string | symbol, any>();

export const globalState = {
    isLoadingLocal: false,
    isLoadingRemote: false,
    isMerging: false,
};

export function checkActivate(node: NodeValue) {
    const root = node.root;
    root.activate?.();
    if (root.toActivate) {
        root.toActivate.forEach(checkActivate);
        delete root.toActivate;
    }
}

export function getNode(obs: ObservableReadable): NodeValue {
    return obs && (obs as any)[symbolGetNode];
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

    return { prevValue, newValue, parentValue };
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
        child = key !== 'size' && (child instanceof Map || child instanceof WeakMap) ? child.get(key) : child[key];
    }
    return child;
}

const cloneFunction = (originalFunction: Function) => {
    const length = originalFunction.length;
    return length > 1
        ? (arg1: any, arg2: any) => originalFunction(arg1, arg2)
        : (...args: any[]) => originalFunction(...args);
};

export function getChildNode(node: NodeValue, key: string, asFunction?: Function): NodeValue {
    // Get the child by key
    let child = node.children?.get(key);

    // Create the child node if it doesn't already exist
    if (!child) {
        child = {
            root: node.root,
            parent: node,
            key,
            lazy: true,
        };
        if (asFunction) {
            child = Object.assign(cloneFunction(asFunction), child);
        }
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

export function extractFunction(node: NodeValue, key: string, fnOrComputed: Function, computedChildNode?: never): void;
export function extractFunction(
    node: NodeValue,
    key: string,
    fnOrComputed: ObservableComputed,
    computedChildNode: NodeValue,
): void;
export function extractFunction(
    node: NodeValue,
    key: string,
    fnOrComputed: Function | ObservableComputed,
    computedChildNode: NodeValue | undefined,
): void {
    if (!node.functions) {
        node.functions = new Map();
    }

    node.functions.set(key, fnOrComputed);

    if (computedChildNode) {
        computedChildNode.parentOther = getChildNode(node, key);
        if (!node.root.toActivate) {
            node.root.toActivate = [];
        }
        node.root.toActivate.push(computedChildNode);
    }
}
