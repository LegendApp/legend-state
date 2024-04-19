import { isArray, isChildNodeValue, isDate, isFunction, isObject } from './is';
import type { NodeValue, ObservableEvent, TypeAtPath, UpdateFn } from './observableInterfaces';
import type { Observable, ObservableParam } from './observableTypes';

export const symbolToPrimitive = Symbol.toPrimitive;
export const symbolGetNode = Symbol('getNode');
export const symbolDelete = /* @__PURE__ */ Symbol('delete');
export const symbolOpaque = Symbol('opaque');
export const optimized = Symbol('optimized');
export const symbolLinked = Symbol('linked');

export const globalState = {
    isLoadingLocal: false,
    isMerging: false,
    isLoadingRemote: false,
    activateSyncedNode: undefined as unknown as (node: NodeValue, newValue: any) => { update: UpdateFn; value: any },
    pendingNodes: new Map<NodeValue, () => void>(),
    dirtyNodes: new Set<NodeValue>(),
    replacer: undefined as undefined | ((this: any, key: string, value: any) => any),
    reviver: undefined as undefined | ((this: any, key: string, value: any) => any),
};

export function getPathType(value: any): TypeAtPath {
    return isArray(value) ? 'array' : value instanceof Map ? 'map' : value instanceof Set ? 'set' : 'object';
}

function replacer(key: string, value: any) {
    if (value instanceof Map) {
        return {
            __LSType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else if (value instanceof Set) {
        return {
            __LSType: 'Set',
            value: Array.from(value), // or with spread: value: [...value]
        };
    } else if (globalState.replacer) {
        value = globalState.replacer(key, value);
    }
    return value;
}

const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
function reviver(key: string, value: any) {
    if (value) {
        if (typeof value === 'string' && ISO8601.test(value)) {
            return new Date(value);
        }
        if (typeof value === 'object') {
            if (value.__LSType === 'Map') {
                return new Map(value.value);
            } else if (value.__LSType === 'Set') {
                return new Set(value.value);
            }
        }
        if (globalState.reviver) {
            value = globalState.reviver(key, value);
        }
    }
    return value;
}

export function safeStringify(value: any) {
    return JSON.stringify(value, replacer);
}
export function safeParse(value: any) {
    return JSON.parse(value, reviver);
}
export function clone(value: any) {
    return safeParse(safeStringify(value));
}

export function isObservable(obs: any): obs is Observable {
    return !!obs && !!obs[symbolGetNode as any];
}

export function getNode(obs: ObservableParam): NodeValue {
    return obs && (obs as any)[symbolGetNode];
}

export function isEvent(obs: any): obs is ObservableEvent {
    return obs && (obs[symbolGetNode as any] as NodeValue)?.isEvent;
}

export function setNodeValue(node: NodeValue, newValue: any) {
    const parentNode = node.parent ?? node;
    const key = node.parent ? node.key : '_';

    const isDelete = newValue === symbolDelete;
    if (isDelete) newValue = undefined;

    // Get the value of the parent
    const parentValue = node.parent ? ensureNodeValue(parentNode) : parentNode.root;

    // Save the previous value first
    const prevValue = parentValue[key];

    const isFunc = isFunction(newValue);

    // Compute newValue if newValue is a function or an observable
    newValue = !parentNode.isAssigning && isFunc ? newValue(prevValue) : newValue;

    if (
        !globalState.isMerging ||
        prevValue === undefined ||
        isFunction(prevValue) ||
        !node.parent?.functions?.get(key)
    ) {
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
        child = key !== 'size' && (child instanceof Map || child instanceof WeakMap) ? child.get(key) : child[key];
    }
    return child;
}

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
        // Lookup functions are bound with the child key
        if (node.lazyFn?.length === 1) {
            asFunction = node.lazyFn.bind(node, key);
        }
        if (isFunction(asFunction)) {
            child = Object.assign(() => {}, child);
            child.lazyFn = asFunction;
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
    if (!value || isFunction(value)) {
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
    let idKey: string | ((value: any) => string) | undefined = isObservable(obj)
        ? undefined
        : isObject(obj)
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
        const k = node.key + '_keyExtractor';
        const keyExtractor =
            (node.functions?.get(k) as (value: any) => string) ??
            (getNodeValue(node.parent)[node.key + '_keyExtractor'] as (value: any) => string);
        if (keyExtractor && isFunction(keyExtractor)) {
            idKey = keyExtractor;
        }
    }

    return idKey;
}

export function extractFunction(node: NodeValue, key: string, fnOrComputed: Function): void;
export function extractFunction(node: NodeValue, key: string, fnOrComputed: Observable): void;
export function extractFunction(node: NodeValue, key: string, fnOrComputed: Function | Observable): void {
    if (!node.functions) {
        node.functions = new Map();
    }

    node.functions.set(key, fnOrComputed);
}
export function equals(a: unknown, b: unknown) {
    return a === b || (isDate(a) && isDate(b) && +a === +b);
}
