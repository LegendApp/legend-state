import { isObject, isString } from '@legendapp/tools';
import { isPrimitive } from './globals';
import { Observable, ObservableEventType } from './observableInterfaces';

interface TreeNode {
    parent: TreeNode;
    key: string | number;
    listeners?: Set<(value, prevValue) => void>;
    children?: Map<string, TreeNode>;
    value: any;
    prop?: { [symbolProp]: any };
}
const state = {
    mapObjects: new WeakMap<object, TreeNode>(),
    inSet: false,
    lastAccessedObject: undefined as any,
    lastAccesssedProp: undefined as any,
};

const symbolProp = Symbol('__prop');

const mapFns = new Map<string, Function>([
    ['set', set],
    ['on', on],
    ['prop', prop],
]);

function extendPrototypesObject() {
    const fn = (name: string) =>
        function (...args: any) {
            const node = state.mapObjects.get(this);
            if (node) {
                return mapFns.get(name).apply(this, [node, ...args]);
            }
        };
    const toOverride = [Object];
    ['assign', 'get', 'on', 'set', 'delete', 'prop'].forEach((key) => {
        toOverride.forEach((override) => (override.prototype[key] = fn(key)));
    });
}

extendPrototypesObject();

function cleanup(node: TreeNode, newValue: any, shouldClearListeners: boolean) {
    // Run listeners on old deleted children
    // And remove them from tree

    if (shouldClearListeners && node.listeners) {
        node.listeners.forEach((cb) => cb(undefined, undefined));
        node.listeners.clear();
    }

    if (node.children) {
        node.children.forEach((child) => {
            const v = newValue[child.key];
            // Notify of being undefined
            if (v === undefined || v === null) {
                cleanup(child, v, true);
            }
        });
        node.children.clear();
    }

    node.parent.children.delete(node.key as string);
    state.mapObjects.delete(node.value);
}

function set(node: TreeNode, newValue: any): any;
function set(node: TreeNode, key: string, newValue: any): any;
function set(node: TreeNode, key: string, newValue?: any): any {
    if (arguments.length < 3) {
        newValue = key;
        key = undefined;

        state.inSet = true;
        // debugger;
        const parent = node.parent;
        const oldValue = node.value;
        if (!parent) {
            // At root

            // TODO: Remove old values
            Object.assign(node.value, newValue);
        } else {
            // In child, can just replace
            parent.value[node.key] = newValue;
            cleanup(node, newValue, false);
        }

        recursePaths(newValue, node);

        // Run listeners up tree
        notify(node, newValue, oldValue);
        state.inSet = false;
    } else {
        return set(propNode(node, key as string), newValue);
    }
}

function on(node: TreeNode, type: ObservableEventType, callback: (value, prevValue) => void);
function on(node: TreeNode, key: string, type: ObservableEventType, callback: (value, prevValue) => void);
function on(
    node: TreeNode,
    key: string | ObservableEventType,
    type: ((value, prevValue) => void) | ObservableEventType,
    callback?: (value, prevValue) => void
) {
    if (arguments.length < 4) {
        // @ts-ignore
        callback = type;
        // @ts-ignore
        type = key;
        key = undefined;
    } else {
        // @ts-ignore
        return on(propNode(node, key), type, callback);
    }
    if (!node.listeners) {
        node.listeners = new Set();
    }
    node.listeners.add(callback);

    return undefined;
}

function propNode(node: TreeNode, key: string) {
    let child = node.children?.get(key);
    if (!child) {
        const prop = { [symbolProp]: { node, key } };
        child = {
            parent: node,
            key,
            value: node.value[key],
            prop,
        };
        state.mapObjects.set(prop, child);
        if (!node.children) {
            node.children = new Map();
        }
        node.children.set(key, child);
    }
    return child;
}

function prop(node: TreeNode, key: string) {
    return propNode(node, key).prop;
}

function notify(node: TreeNode, newValue: any, prevValue: any) {
    if (node.listeners) {
        node.listeners.forEach((cb) => cb(newValue, prevValue));
    }
    if (node.parent) {
        notify(node.parent, { [node.key]: newValue }, { [node.key]: prevValue });
    }
}

function recursePaths(obj: Record<any, any>, node: TreeNode) {
    if (!isPrimitive(obj)) {
        state.mapObjects.set(obj, node);
        Object.keys(obj).forEach((key) => {
            let o = obj[key];
            if (!isPrimitive(o)) {
                const child: TreeNode = {
                    parent: node,
                    key: key,
                    value: o,
                };
                o = obj[key] = proxy(o);
                recursePaths(o, child);
                if (!node.children) {
                    node.children = new Map();
                }
                node.children.set(key, child);
            }
        });
    }
}

const proxyHandler: ProxyHandler<any> = {
    get(target, prop, receiver) {
        // state.lastAccessedObject = receiver;
        // state.lastAccesssedProp = prop;
        return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
        const ok = state.inSet;
        if (ok) {
            Reflect.set(target, prop, value, receiver);
        }
        return ok;
    },
};

function proxy<T extends object | Record<any, any>>(obj: T): T {
    // Only want to proxy in development so we don't take the performance hit in production
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
        ? new Proxy(obj, proxyHandler)
        : obj;
}

export function observable2<T>(obj: T): Observable<T> {
    const obs = (isObject(obj) ? proxy(obj) : obj) as Observable<T>;
    state.inSet = true;
    recursePaths(obs, {
        parent: undefined,
        key: undefined,
        value: obs,
    });
    state.inSet = false;

    return obs as Observable<T>;
}
