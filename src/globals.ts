import { isChildNodeValue, isFunction, isObject } from './is';
import { SyncedParamsWithLookup, NodeValue, UpdateFn } from './observableInterfaces';
import { Observable, ObservablePrimitive, ObservableReadable } from './observableTypes';

export const symbolToPrimitive = Symbol.toPrimitive;
export const symbolGetNode = Symbol('getNode');
export const symbolDelete = /* @__PURE__ */ Symbol('delete');
export const symbolOpaque = Symbol('opaque');
export const optimized = Symbol('optimized');
export const symbolSynced = Symbol('synced');

// TODOV3 Remove these
export const extraPrimitiveActivators = new Map<string | symbol, boolean>();
export const extraPrimitiveProps = new Map<string | symbol, any>();

export const globalState = {
    isLoadingLocal: false,
    isMerging: false,
    isLoadingRemote$: undefined as unknown as ObservablePrimitive<boolean>,
    activateNode: undefined as unknown as (
        node: NodeValue,
        refresh: () => void,
        wasPromise: boolean,
        newValue: any,
    ) => { update: UpdateFn; value: any },
    pendingNodes: new Map<NodeValue, () => void>(),
    dirtyNodes: new Set<NodeValue>(),
};

export function isObservable(obs: any): obs is Observable {
    return !!obs && !!obs[symbolGetNode as any];
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
    newValue = !parentNode.isAssigning && isFunc ? newValue(prevValue) : newValue;

    // If setting an observable, set a link to the observable instead
    if (isObservable(newValue)) {
        const val = newValue;
        node.lazy = true;
        node.lazyFn = () => val;
        newValue = undefined;
    }

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
        if (node.activationState) {
            const { lookup } = node.activationState as SyncedParamsWithLookup<any>;
            if (lookup) {
                asFunction = lookup.bind(node, key);
            }
        }
        if (asFunction) {
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
