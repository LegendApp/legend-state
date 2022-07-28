import { isObject } from '@legendapp/tools';
import { isPrimitive, symbolShallow } from './globals';
import { ListenerFn2, Observable2, ObservableEventType, ObservableListenerInfo2 } from './observableInterfaces';

export interface ObservableListener2<T = any> {
    node: TreeNode;
    callback: ListenerFn2<T>;
    shallow: boolean;
    dispose: () => void;
    isDisposed: boolean;
}
interface TreeNode {
    parent: TreeNode;
    key: string | number;
    listeners?: Set<ObservableListener2>;
    children?: Map<string, TreeNode>;
    value: any;
    prop?: { [symbolProp]: { node: TreeNode; key: string } };
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
    ['assign', assign],
    ['delete', deleteFn],
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
    ['assign', 'on', 'set', 'delete', 'prop'].forEach((key) => {
        toOverride.forEach((override) => (override.prototype['_' + key] = fn(key)));
    });
}

extendPrototypesObject();

function copyToNewTree(node: TreeNode, newValue: any, shouldClearListeners: boolean) {
    // Run listeners on old deleted children
    // And remove them from tree

    if (node.children) {
        // Wipe out old children that don't exist anymore
        node.children.forEach((child) => {
            const v = !newValue || newValue[child.key];
            // Notify of being undefined
            if (v === undefined || v === null) {
                copyToNewTree(child, v, true);
                node.children.delete(child.key as string);
            }
        });
        Object.keys(newValue).forEach((key) => {
            const child = node.children.get(key);
            if (child) {
                const val = newValue[key];
                state.mapObjects.delete(child.prop || child.value);
                const prevValue = child.value;
                child.value = val;
                if (child.prop) {
                    child.prop = prop(child, key);
                }
                state.mapObjects.set(child.prop || val, child);

                notify(child, val, prevValue);

                copyToNewTree(child, val, true);
            }
        });
    }

    if (!newValue) {
        if (shouldClearListeners && node.listeners) {
            node.listeners.forEach((listener) => listener.callback(undefined, undefined));
            node.listeners.clear();
        }

        node.parent?.children.delete(node.key as string);
        state.mapObjects.delete(node.value);
    }
}

function set(node: TreeNode, newValue: any): any;
function set(node: TreeNode, key: string, newValue: any): any;
function set(node: TreeNode, key: string, newValue?: any): any {
    if (arguments.length < 3) {
        newValue = key;
        key = undefined;

        state.inSet = true;
        const parent = node.parent;
        const oldValue = node.value;
        if (!parent) {
            // At root

            // TODO: Remove old values
            Object.assign(node.value, newValue);
        } else {
            // In child, can just replace
            node.value = parent.value[node.key] = newValue;
            // cleanup(node, newValue, false);
        }

        copyToNewTree(node, newValue, false);

        recursePaths(newValue, node);

        // Run listeners up tree
        notify(node, newValue, oldValue);
        state.inSet = false;
    } else {
        return set(propNode(node, key as string), newValue);
    }
}

function assign(node: TreeNode, value: any) {
    Object.keys(value).forEach((key) => {
        set(propNode(node, key), value[key]);
    });
}

function deleteFn(node: TreeNode, key?: string | number) {
    if (!key) {
        return deleteFn(node.parent, node.key);
    }

    copyToNewTree(propNode(node, key as string), {}, true);

    delete node.value[key];
}

export function disposeListener(listener: ObservableListener2) {
    if (listener && !listener.isDisposed) {
        listener.isDisposed = true;
        const listeners = listener.node.listeners;
        if (listeners) {
            listeners.delete(listener);
        }
    }
}

function onChange(node: TreeNode, callback: (value, prevValue) => void, shallow: boolean) {
    const listener = { node, callback, shallow } as ObservableListener2;
    listener.dispose = disposeListener.bind(listener, listener);

    if (!node.listeners) {
        node.listeners = new Set();
    }
    node.listeners.add(listener);

    return listener;
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

    return (
        (type === 'change' && onChange(node, callback, false)) ||
        (type === 'changeShallow' && onChange(node, callback, true))
    );
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

export function shallow(obs: Observable2) {
    return {
        [symbolShallow]: obs,
    };
}

function prop(node: TreeNode, key: string) {
    return propNode(node, key).prop;
}

function _notify(node: TreeNode, listenerInfo: ObservableListenerInfo2, fromChild?: boolean) {
    if (node.listeners) {
        const value = node.value;
        node.listeners.forEach((listener) => {
            if (!fromChild || !listener.shallow || (value === undefined) !== (listenerInfo.prevValue === undefined))
                listener.callback(value, listenerInfo);
        });
    }
    if (node.parent) {
        const parentListenerInfo = Object.assign({}, listenerInfo);
        parentListenerInfo.path = [node.key as string].concat(listenerInfo.path);
        _notify(node.parent, parentListenerInfo, /*fromChild*/ true);
    }
}

function notify(node: TreeNode, value: any, prevValue: any) {
    _notify(node, { value, prevValue, path: [] });
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

export function observable2<T extends object | Array<any>>(obj: T): Observable2<T> {
    const obs = (isObject(obj) ? proxy(obj) : obj) as Observable2<T>;
    state.inSet = true;
    recursePaths(obs, {
        parent: undefined,
        key: undefined,
        value: obs,
    });
    state.inSet = false;

    return obs as Observable2<T>;
}
