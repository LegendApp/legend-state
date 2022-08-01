import {
    delim,
    getNodeValue,
    getParentNode,
    getPathNode,
    getProxyValue,
    hasPathNode,
    symbolGet,
    symbolID,
} from './globals';
import { isArray, isFunction, isObject, isPrimitive } from './is';
import { observableBatcher, observableBatcherNotify } from './observableBatcher';
import {
    Observable,
    ObservableListenerInfo,
    ObservableOrPrimitive,
    ObservablePrimitive,
    ObservableWrapper,
    PathNode,
    ProxyValue,
} from './observableInterfaces';
import { onChange, onChangeShallow, onEquals, onHasValue, onTrue } from './on';

let lastAccessedNode: PathNode;
let lastAccessedPrimitive: string;
let inSetFn = false;

const objectFnsProxy = new Map<string, Function>([
    ['set', proxySet],
    ['setProp', proxySetProp],
    ['onChange', onChange],
    ['onChangeShallow', onChangeShallow],
    ['onEquals', onEquals],
    ['onHasValue', onHasValue],
    ['onTrue', onTrue],
    ['prop', prop],
    ['assign', assign],
    ['delete', deleteFnProxy],
]);

// Override primitives
const wrapFn = (fn: Function) =>
    function (...args: any) {
        if (lastAccessedNode && lastAccessedPrimitive) {
            const node = getPathNode(lastAccessedNode.root, lastAccessedNode.path, lastAccessedPrimitive);
            if (getNodeValue(node) === this) {
                return fn(node, ...args);
            }
        }
    };
const toOverride = [Number, Boolean, String];
objectFnsProxy.forEach((fn, key) => {
    toOverride.forEach((override) => (override.prototype[key] = wrapFn(fn)));
});

function collectionSetter(node: PathNode, target: any, prop: string, ...args: any[]) {
    // this = target
    const prevValue =
        // (this instanceof Map && new Map(this)) ||
        // (this instanceof Set && new Set(this)) ||
        (isArray(target) && target.slice()) || target;

    const ret = (target[prop] as Function).apply(target, args);

    if (node) {
        const parentNode = getParentNode(node);
        if (parentNode) {
            const parent = getNodeValue(parentNode);

            // Set the object to the previous value first
            parent[node.key] = prevValue;

            // Then set with the new value so it notifies with the correct prevValue
            set(parentNode, node.key, target);
        }
    }

    // Return the original value
    return ret;
}

function updateNodes(parent: PathNode, obj: Record<any, any>, prevValue?: any) {
    const isArr = isArray(obj);
    // If array it's faster to just use the array
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;

    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        const doNotify =
            !isArr && prevValue && obj[key] !== prevValue[key] && hasPathNode(parent.root, parent.path, key);

        if (doNotify) {
            const isObj = !isPrimitive(obj[key]);
            // Notify for this child if this element is different and it has a PathNode already
            // But do not notify child if the parent is an array - the array's listener will cover it
            const child = (isObj || doNotify) && getPathNode(parent.root, parent.path, key);

            // If object iterate through its children
            if (isObj) {
                updateNodes(child, obj[key], prevValue?.[key]);
            }

            // Do the notify at this node
            if (doNotify) {
                _notify(child, { path: [], prevValue: prevValue[key], value: obj[key] }, 0);
            }
        }
    }
}

function createProxy(node: PathNode) {
    const proxy = new Proxy<ProxyValue>({ path: node.path, root: node.root }, proxyHandler);
    node.root.proxies.set(node.path, proxy);
    return proxy;
}

const descriptorNotEnumerable: PropertyDescriptor = {
    enumerable: false,
    configurable: false,
};

const proxyHandler: ProxyHandler<any> = {
    get(target, prop: any) {
        const node = getPathNode(target.root, target.path);
        const fn = objectFnsProxy.get(prop);

        if (fn) {
            return (a, b, c) => fn(node, a, b, c);
        } else {
            const value = getNodeValue(node);
            const vProp = value[prop];
            if (prop === symbolGet) {
                return value;
            } else if (prop === 'get') {
                return () => value;
            } else if (isFunction(vProp)) {
                if (isArray(value)) {
                    return (...args) => collectionSetter(node, value, prop, ...args);
                }
                return vProp.bind(value);
            } else if (isPrimitive(vProp)) {
                lastAccessedNode = node;
                lastAccessedPrimitive = prop;
                return vProp;
            } else {
                const path = target.path + delim + prop;
                let proxy = node.root.proxies.get(path);
                if (!proxy) {
                    const child = getPathNode(node.root, target.path, prop);

                    proxy = createProxy(child);
                }
                return proxy;
            }
        }
    },
    getPrototypeOf(target) {
        const value = getProxyValue(target);
        return Reflect.getPrototypeOf(value);
    },
    ownKeys(target) {
        const value = getProxyValue(target);
        const keys = Reflect.ownKeys(value);
        if (isArray(value)) {
            if (keys[keys.length - 1] === 'length') {
                keys.splice(keys.length - 1, 1);
            }
        }
        return keys;
    },
    getOwnPropertyDescriptor(target, p) {
        if (p === symbolID) {
            return descriptorNotEnumerable;
        }

        const value = getProxyValue(target);
        const own = Reflect.getOwnPropertyDescriptor(value, p);
        return own;
    },
    set(target, prop, value) {
        if (inSetFn) {
            // If this assignment comes from within a set function it's allowed.
            // Notifying listeners will be handled elsewhere
            Reflect.set(target, prop, value);
            return true;
        } else {
            return false;
        }
    },
    deleteProperty(target, prop) {
        if (inSetFn) {
            // If this assignment comes from within a set function it's allowed.
            // Notifying listeners will be handled elsewhere
            Reflect.deleteProperty(target, prop);
            return true;
        } else {
            return false;
        }
    },
    has(target, prop) {
        const value = getProxyValue(target);
        return Reflect.has(value, prop);
    },
};

function cleanup(node: PathNode, newValue: object, prevValue: object) {
    const isArr = isArray(prevValue);
    const isObj = isObject(prevValue);

    if (isArr || isObj) {
        // If array it's faster to just use the array
        const keys = isArr ? prevValue : Object.keys(prevValue);
        const length = keys.length;

        for (let i = 0; i < length; i++) {
            const key = isArr ? i : keys[i];

            // If this child has a PathNode then clean it up
            const child = getPathNode(node.root, node.path, key, /*noCreate*/ true);
            if (child) {
                cleanup(child, newValue?.[key], prevValue[key]);
            }
        }
    }

    if (prevValue !== undefined && prevValue !== null && (newValue === null || newValue === undefined)) {
        node.root.proxies.delete(node.path);
    }
}

function proxySet(node: PathNode, newValue: any) {
    return node.root.isPrimitive ? set(node, 'current', newValue) : set(getParentNode(node), node.key, newValue);
}

function proxySetProp(node: PathNode, key: string, newValue: any) {
    return set(node, key, newValue);
}

// function set(node: PathNode, newValue: any): any;
// function set(node: PathNode, key: string, newValue: any): any;
function set(node: PathNode, key: string, newValue?: any) {
    newValue = newValue?.[symbolGet] ?? newValue;

    if (!key && !node.path.includes(delim)) {
        return assign(node, newValue);
    }

    inSetFn = true;

    const childNode = getPathNode(node.root, node.path, key);

    let parentValue = getNodeValue(node);

    // Save the previous value first
    const prevValue = parentValue[key];

    // Save the new value
    parentValue[key] = newValue;

    // If previous was an object or array clean it up
    if (!isPrimitive(prevValue)) {
        cleanup(childNode, newValue, prevValue);
    }

    const isPrim = isPrimitive(newValue);

    // If new value is an object or array update PathNodes and notify down the tree
    if (!isPrim) {
        updateNodes(childNode, newValue, prevValue);
    }

    // Notify for this element if it's an object or it's changed
    if (!isPrim || newValue !== prevValue) {
        notify(childNode, newValue, prevValue, prevValue == undefined || isArray(parentValue) ? -1 : 0);
    }

    inSetFn = false;

    return newValue;
}

function _notify(node: PathNode, listenerInfo: ObservableListenerInfo, level: number) {
    // Notify all listeners
    if (node.listeners) {
        const value = getNodeValue(node);
        for (let listener of node.listeners) {
            // Notify if listener is not shallow or if this is the first level
            if (!listener.shallow || level <= 0) {
                observableBatcherNotify(listener.callback, value, listenerInfo);
            }
        }
    }
}

function _notifyParents(node: PathNode, listenerInfo: ObservableListenerInfo, level: number) {
    // Do the notify
    _notify(node, listenerInfo, level);
    // If not root notify up through parents
    if (node.path !== '_') {
        const parent = getParentNode(node);
        if (parent) {
            const parentListenerInfo = Object.assign({}, listenerInfo);
            parentListenerInfo.path = [node.key].concat(listenerInfo.path);
            _notifyParents(parent, parentListenerInfo, level + 1);
        }
    }
}
function notify(node: PathNode, value: any, prevValue: any, level: number) {
    // Create the listenerInfo
    const listenerInfo = { path: [], prevValue, value };
    // Start notifying up through parents with the listenerInfo
    _notifyParents(node, listenerInfo, level);
}

function prop(node: PathNode, key: string) {
    const child = getPathNode(node.root, node.path, key);
    return createProxy(child);
}

function assign(node: PathNode, value: any) {
    observableBatcher.begin();

    // Assign calls set with all assigned properties
    const keys = Object.keys(value);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        set(node, keys[i], value[keys[i]]);
    }

    const ret = getNodeValue(node);
    observableBatcher.end();

    return ret;
}

function deleteFnProxy(node: PathNode, key: string) {
    return key !== undefined ? deleteFn(node, key) : deleteFn(getParentNode(node), node.key);
}
function deleteFn(node: PathNode, key?: string) {
    // delete sets to undefined first to cleanup children
    set(node, key, undefined);

    inSetFn = true;
    // Then delete the key from the object
    let child = getNodeValue(node);
    delete child[key];

    inSetFn = false;
}

export function observable<T extends object | Array<any>>(obj: T): Observable<T>;
export function observable<T extends boolean>(prim: T): ObservablePrimitive<boolean>;
export function observable<T extends string>(prim: T): ObservablePrimitive<string>;
export function observable<T extends number>(prim: T): ObservablePrimitive<number>;
export function observable<T extends boolean | string | number>(prim: T): ObservablePrimitive<T>;
export function observable<T>(obj: any): ObservableOrPrimitive<T> {
    const isPrim = isPrimitive(obj);
    // Primitives wrap in current
    if (isPrim) {
        obj = { current: obj };
    }

    const obs = {
        _: obj as Observable,
        isPrimitive: isPrim,
        pathNodes: new Map(),
        proxies: new Map<string, object>(),
    } as ObservableWrapper;

    const node = getPathNode(obs, '_');

    updateNodes(node, obs._);

    // if (isPrim) {
    //     // Bind callbacks to "current" so handlers get the primitive value
    //     for (let i = 0; i < objectFns.length; i++) {
    //         const fn = objectFns[i][0];
    //         obs._._[fn] = obs._._[fn].bind(obs, 'current');
    //     }
    // }
    const proxy = createProxy(node);

    // @ts-ignore
    return proxy;
}
