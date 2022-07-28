import { isObject } from '@legendapp/tools';
import { isPrimitive2, symbolProp, symbolShallow } from './globals';
import { ListenerFn2, Observable2, ObservableEventType, ObservableListenerInfo2 } from './observableInterfaces';

export interface ObservableListener2<T = any> {
    node: PathNode;
    callback: ListenerFn2<T>;
    shallow: boolean;
    dispose: () => void;
    isDisposed: boolean;
}
// interface TreeNode {
//     parent: TreeNode;
//     key: string | number;
//     listeners?: Set<ObservableListener2>;
//     children?: Map<string, TreeNode>;
//     value: any;
//     prop?: { [symbolProp]: { node: TreeNode; key: string } };
// }
interface PathNode {
    parent: PathNode;
    key: string;
    listeners?: Set<ObservableListener2>;
    children?: Map<string, PathNode>;
    value: any;
    prop?: { [symbolProp]: PathNode };
}
const state = {
    mapPaths: new WeakMap<object, PathNode>(),
    // mapObjects: new WeakMap<object, TreeNode>(),
    fromKey: false,
    inSet: false,
};

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
            const node = this[symbolProp] || state.mapPaths.get(this);
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

function extendPrototypesArray() {
    const fn = (override: any, name: string) => {
        const orig = override.prototype[name];
        return function () {
            state.inSet = true;
            const prevValue = this.slice();
            const ret = orig.apply(this, arguments);
            state.inSet = false;

            const node = state.mapPaths.get(this);
            if (node) {
                const parent = node.parent;
                node.value = prevValue;
                parent.value[node.key] = prevValue;
                set(node, this);
            }

            return ret;
        };
    };
    const toOverride = [Array];
    ['push', 'splice'].forEach((key) => {
        toOverride.forEach((override) => (override.prototype[key] = fn(override, key)));
    });
}
extendPrototypesArray();

// function copyToNewTree(node: TreeNode, newValue: any, shouldClearListeners: boolean) {
//     // Run listeners on old deleted children
//     // And remove them from tree

//     if (node.children) {
//         // Wipe out old children that don't exist anymore
//         node.children.forEach((child) => {
//             const v = !newValue || newValue[child.key];
//             // Notify of being undefined
//             if (v === undefined || v === null) {
//                 copyToNewTree(child, v, true);
//             }
//         });
//         Object.keys(newValue).forEach((key) => {
//             const child = node.children.get(key);
//             if (child) {
//                 const val = newValue[key];
//                 state.mapObjects.delete(child.prop || child.value);
//                 const prevValue = child.value;
//                 child.value = val;
//                 if (child.prop) {
//                     child.prop = prop(child, key);
//                 }
//                 state.mapObjects.set(child.prop || val, child);

//                 notify(child, val, prevValue);

//                 copyToNewTree(child, val, true);
//             }
//         });
//     }

//     if (!newValue) {
//         if (shouldClearListeners && node.listeners) {
//             node.listeners.forEach((listener) => listener.callback(undefined, undefined));
//             node.listeners.clear();
//         }

//         node.parent?.children.delete(node.key as string);
//         state.mapObjects.delete(node.value);
//     }
// }
function updateChildren(node: PathNode, prevValue: any) {
    // Run listeners on old deleted children
    // And remove them from tree

    const newValue = node.value;
    if (node.children) {
        // Wipe out old children that don't exist anymore
        node.children.forEach((child) => {
            const v = !newValue || newValue[child.key];
            // Notify of being undefined
            if (v === undefined || v === null) {
                updateChildren(child, prevValue[child.key]);
            }
        });
        Object.keys(node.value).forEach((key) => {
            const child = node.children.get(key);
            if (child) {
                child.value = node.value[key];
                if (!isPrimitive2(child)) {
                    updateChildren(child, prevValue[key]);
                }
                // const val = newValue[key];
                // state.mapObjects.delete(child.prop || child.value);
                // const prevValue = child.value;
                // child.value = val;
                // if (child.prop) {
                //     child.prop = prop(child, key);
                // }
                // state.mapObjects.set(child.prop || val, child);

                // notify(child, val, prevValue);

                // copyToNewTree(child, val, true);
            } else {
                createNodes(node, node.value[key]);
            }
        });
    }

    if (node.listeners) {
        notify(node, newValue, prevValue);
    }

    // if (!newValue) {
    //     if (shouldClearListeners && node.listeners) {
    //         node.listeners.forEach((listener) => listener.callback(undefined, undefined));
    //         node.listeners.clear();
    //     }

    //     node.parent?.children.delete(node.key as string);
    //     state.mapObjects.delete(node.value);
    // }
}

function ensureNode(parent: PathNode, key: string) {
    let child = parent?.children?.get(key);
    if (!child) {
        child = {
            parent: parent,
            key: key,
            value: parent?.value?.[key],
        };

        if (!parent.children) {
            parent.children = new Map();
        }
        parent.children.set(key, child);
    }
    return child;
}

function createNodes(parent: PathNode, obj: Record<any, any>) {
    if (!isPrimitive2(obj)) {
        Object.keys(obj).forEach((key) => {
            if (!isPrimitive2(obj[key]) && !parent.children?.has(key)) {
                let o = obj[key];
                const child: PathNode = ensureNode(parent, key);
                child.value = o;
                o = obj[key] = proxy(o);
                createNodes(child, o);
            }
        });
        state.mapPaths.set(obj, parent);
    }
}

function set(node: PathNode, newValue: any): any;
function set(node: PathNode, key: string, newValue: any): any;
function set(node: PathNode, key: string, newValue?: any): any {
    if (arguments.length < 3) {
        if (node.parent) {
            return set(node.parent, node.key, key);
        } else {
            // state.inSet = true;
            // state.inSet = false;
        }
        // newValue = key;
        // key = undefined;

        // const parent = node.parent;
        // const prevValue = node.value;
        // if (!parent) {
        //     // At root

        //     // TODO: Remove old values
        //     Object.assign(node.value, newValue);
        // } else {
        //     // In child, can just replace
        //     node.value = parent.value[node.key] = newValue;
        //     // cleanup(node, newValue, false);
        // }

        // updateChildren(node, prevValue);

        // // copyToNewTree(node, newValue, false);

        // // recursePaths(newValue, node);

        // // Run listeners up tree
        // notify(node, newValue, prevValue, state.fromKey ? -1 : 0);
        // state.inSet = false;
    } else {
        state.inSet = true;
        const prevValue = node.value[key];
        node.value[key] = newValue;

        const child = ensureNode(node, key);

        child.value = newValue;

        createNodes(child, newValue);

        // if (!parent) {
        //     // At root

        //     // TODO: Remove old values
        //     Object.assign(node.value, newValue);
        // } else {
        //     // In child, can just replace
        //     node.value = parent.value[node.key] = newValue;
        //     // cleanup(node, newValue, false);
        // }

        updateChildren(child, prevValue);

        // copyToNewTree(node, newValue, false);

        // recursePaths(newValue, node);

        // Run listeners up tree
        notify(child, newValue, prevValue, state.fromKey ? -1 : 0);
        state.inSet = false;

        // state.fromKey = true;
        // const ret = set(propNode(node, key as string), newValue);
        // state.fromKey = false;
        // return ret;
    }
}

function assign(node: PathNode, value: any) {
    Object.keys(value).forEach((key) => {
        set(node, key, value[key]);
    });
}

function deleteFn(node: PathNode, key?: string | number) {
    if (!key) {
        return deleteFn(node.parent, node.key);
    }

    // copyToNewTree(propNode(node, key as string), {}, true);

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

function onChange(node: PathNode, callback: (value, prevValue) => void, shallow: boolean) {
    const listener = { node, callback, shallow } as ObservableListener2;
    listener.dispose = disposeListener.bind(listener, listener);

    if (!node.listeners) {
        node.listeners = new Set();
    }
    node.listeners.add(listener);

    return listener;
}

function on(node: PathNode, type: ObservableEventType, callback: (value, prevValue) => void);
function on(node: PathNode, key: string, type: ObservableEventType, callback: (value, prevValue) => void);
function on(
    node: PathNode,
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
        return on(ensureNode(node, key), type as ObservableEventType, callback);
    }

    return (
        (type === 'change' && onChange(node, callback, false)) ||
        (type === 'changeShallow' && onChange(node, callback, true))
    );
}

export function shallow(obs: Observable2) {
    return {
        [symbolShallow]: obs,
    };
}

function prop(node: PathNode, key: string) {
    const child = ensureNode(node, key);
    if (!child.prop) {
        child.prop = {
            [symbolProp]: child,
        };
    }
    return child.prop;
}

function _notify(node: PathNode, listenerInfo: ObservableListenerInfo2, levels: number) {
    if (node.listeners) {
        const value = node.value;
        node.listeners.forEach((listener) => {
            if (levels < 1 || !listener.shallow || (value === undefined) !== (listenerInfo.prevValue === undefined))
                listener.callback(value, listenerInfo);
        });
    }
    if (node.parent) {
        const parentListenerInfo = Object.assign({}, listenerInfo);
        parentListenerInfo.path = [node.key as string].concat(listenerInfo.path);
        _notify(node.parent, parentListenerInfo, levels + 1);
    }
}

function notify(node: PathNode, value: any, prevValue: any, levels = 0) {
    let n = node;
    // Don't notify if there's no listeners
    while (n) {
        if (n.listeners?.size > 0) break;
        n = n.parent;
    }
    if (n) {
        _notify(node, { value, prevValue, path: [] }, levels);
    }
}

// function recursePaths(obj: Record<any, any>, node: TreeNode) {
//     if (!isPrimitive2(obj)) {
//         state.mapObjects.set(obj, node);
//         Object.keys(obj).forEach((key) => {
//             let o = obj[key];
//             if (!isPrimitive2(o)) {
//                 const child: TreeNode = {
//                     parent: node,
//                     key: key,
//                     value: o,
//                 };
//                 o = obj[key] = proxy(o);
//                 recursePaths(o, child);
//                 if (!node.children) {
//                     node.children = new Map();
//                 }
//                 node.children.set(key, child);
//             }
//         });
//     }
// }

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
    return (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && isObject(obj)
        ? new Proxy(obj, proxyHandler)
        : obj;
}

export function observable2<T extends object | Array<any>>(obj: T): Observable2<T> {
    const out = { _: obj };
    const obs = proxy(out);
    state.inSet = true;
    createNodes(
        {
            parent: undefined,
            key: undefined,
            value: obs,
        },
        obs
    );
    state.inSet = false;

    return obs._ as Observable2<T>;
}
