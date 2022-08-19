import { get, getChildNode, getNodeValue, nextNodeID, observe, symbolIsObservable } from './globals';
import { isArray, isFunction, isObject, isPrimitive, isSymbol } from './is';
import { observableBatcher, observableBatcherNotify } from './observableBatcher';
import {
    NodeValue,
    Observable,
    ObservableObjectOrPrimitive,
    ObservablePrimitive,
    ObservableWrapper,
} from './observableInterfaces';
import { onChange, onChangeShallow, onEquals, onHasValue, onTrue } from './on';
import { tracking, untrack, updateTracking } from './state';

let lastAccessedNode: NodeValue;
let lastAccessedPrimitive: string;
let inSetFn = false;
const undef = Symbol('undef');

const ArrayModifiers = new Set([
    'copyWithin',
    'fill',
    'from',
    'pop',
    'push',
    'reverse',
    'shift',
    'sort',
    'splice',
    'unshift',
]);
const ArrayLoopers = new Set<keyof Array<any>>(['every', 'some', 'filter', 'forEach', 'map']);

const objectFns = new Map<string, Function>([
    ['get', get],
    ['set', set],
    ['observe', observe],
    ['onChange', onChange],
    ['onChangeShallow', onChangeShallow],
    ['onEquals', onEquals],
    ['onHasValue', onHasValue],
    ['onTrue', onTrue],
    ['ref', ref],
    ['prop', prop],
    ['assign', assign],
    ['delete', deleteFn],
]);

// Override primitives
const wrapFn = (fn: Function) =>
    function (...args: any) {
        if (lastAccessedNode && lastAccessedPrimitive) {
            const node: NodeValue = getChildNode(lastAccessedNode, lastAccessedPrimitive);
            if (getNodeValue(node) === this) {
                return fn(node, ...args);
            }
        }
    };

const toOverride = [Number, Boolean, String];
objectFns.forEach((fn, key) => {
    for (let i = 0; i < toOverride.length; i++) {
        toOverride[i].prototype[key] = wrapFn(fn);
    }
});

function collectionSetter(node: NodeValue, target: any, prop: string, ...args: any[]) {
    const prevValue = (isArray(target) && target.slice()) || target;

    const ret = (target[prop] as Function).apply(target, args);

    if (node) {
        const parent = node.parent;
        if (parent) {
            const parentValue = getNodeValue(parent);

            // Set the object to the previous value first
            parentValue[node.key] = prevValue;

            // Then set with the new value so it notifies with the correct prevValue
            setProp(parent, node.key, target);
        }
    }

    // Return the original value
    return ret;
}

function updateNodes(parent: NodeValue, obj: Record<any, any> | Array<any>, prevValue?: any) {
    const isArr = isArray(obj);
    // If array it's faster to just use the array
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;

    let hasADiff = !isArr || obj?.length !== prevValue?.length;
    const isArrDiff = hasADiff;

    let keyMap: Map<string | number, number>;
    let moved: [string, NodeValue][];

    if (isArr && prevValue?.length && isArray(prevValue) && prevValue[0].id !== undefined) {
        keyMap = new Map();
        moved = [];
        for (let i = 0; i < prevValue.length; i++) {
            keyMap.set(prevValue[i].id, i);
        }
    }

    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        const value = obj[key];
        const prev = prevValue?.[key];

        let isDiff = prevValue && value !== prev;
        if (isDiff) {
            const id = value?.id;

            let child = getChildNode(parent, key);

            // Detect moves within an array. Need to move the original proxy to the new position to keep
            // the proxy stable, so that listeners to this node will be unaffected by the array shift.
            if (isArr && id !== undefined) {
                // Find the previous position of this element in the array
                const keyChild = id !== undefined ? keyMap?.get(id) : undefined;
                if (keyChild !== undefined) {
                    if (keyChild !== key) {
                        // If array length changed then move the original node to the current position
                        if (isArrDiff) {
                            child = getChildNode(parent, keyChild);
                            child.key = key;
                            moved.push([key, child]);
                        }

                        // And check for diff against the previous value in the previous position
                        const prevOfNode = prevValue[keyChild];
                        isDiff = prevOfNode !== value;
                    }
                }
            }

            if (isDiff) {
                // Array has a new / modified element
                hasADiff = true;
                // If object iterate through its children
                if (!isPrimitive(value)) {
                    updateNodes(child, value, prev);
                }
            }
            if (isDiff || !isArrDiff) {
                // Notify for this child if this element is different and it has listeners
                // Or if the position changed in an array whose length did not change
                // But do not notify child if the parent is an array with changing length -
                // the array's listener will cover it
                const doNotify = !!child.listeners;
                if (doNotify) {
                    _notify(child, value, [], value, prev, 0);
                }
            }
        }
    }

    if (moved) {
        for (let i = 0; i < moved.length; i++) {
            const [key, child] = moved[i];
            parent.children.set(key, child);
        }
    }

    return hasADiff;
}

function hasProxy(node: NodeValue, p?: string | number) {
    // Get the child node if p prop
    if (p !== undefined) node = getChildNode(node, p);

    // Create a proxy if not already cached and return it
    return !!node.proxy;
}

function getProxy(node: NodeValue, p?: string | number) {
    // Get the child node if p prop
    if (p !== undefined) node = getChildNode(node, p);

    // Create a proxy if not already cached and return it
    let proxy = node.proxy;
    if (!proxy) {
        proxy = node.proxy = new Proxy<NodeValue>(node, proxyHandler);
    }
    return proxy;
}
function ref(node: NodeValue) {
    if (tracking.nodes) untrack(node);
    return getProxy(node);
}
function prop(node: NodeValue, p: string | number) {
    // Update that this node was accessed for observers
    if (tracking.nodes) {
        updateTracking(getChildNode(node, p), node);
    }
    return getProxy(node, p);
}

const proxyHandler: ProxyHandler<any> = {
    get(target: NodeValue, p: any) {
        // Return true is called by isObservable()
        if (p === symbolIsObservable) {
            return true;
        }

        const node = target;
        const fn = objectFns.get(p);
        // If this is an observable function, call it
        if (fn) {
            if (p === 'set' || p === 'assign') {
                // Set operations do not create listeners
                if (tracking.nodes) untrack(node);
            }
            return function (a, b, c) {
                const l = arguments.length;
                return l > 2 ? fn(node, a, b, c) : l > 1 ? fn(node, a, b) : fn(node, a);
            };
        }

        let value = getNodeValue(node);
        const vProp = value?.[p];

        // Accessing undefined/null/symbols passes straight through if this value has a property for it
        // If it's never been defined assume it's a proxy to a future object
        if (isSymbol(p) || vProp === null || (vProp === undefined && value && value.hasOwnProperty?.(p))) {
            return vProp;
        }
        // Handle function calls
        if (isFunction(vProp)) {
            if (isArray(value)) {
                if (ArrayModifiers.has(p)) {
                    // Call the wrapped modifier function
                    return (...args) => collectionSetter(node, value, p, ...args);
                } else if (ArrayLoopers.has(p)) {
                    // Update that this node was accessed for observers
                    // Listen to the array shallowly
                    if (tracking.nodes) {
                        updateTracking(node, undefined, true);
                    }
                    return function (cbOrig, thisArg) {
                        function cb(_, index: number, array: any[]) {
                            return cbOrig(getProxy(node, index), index, array);
                        }
                        return value[p](cb, thisArg);
                    };
                }
            }
            // Return the function bound to the value
            return vProp.bind(value);
        }

        // Update that this node was accessed for observers
        if (tracking.nodes) {
            if (isArray(value) && p === 'length') {
                updateTracking(node, undefined, /*shallow*/ true);
            } else {
                updateTracking(getChildNode(node, p), node);
            }
        }

        // Accessing primitive returns the raw value
        if (vProp === undefined || vProp === null ? !hasProxy(target, p) : isPrimitive(vProp)) {
            // Accessing a primitive saves the last accessed so that the observable functions
            // bound to primitives can know which node was accessed
            lastAccessedNode = node;
            lastAccessedPrimitive = p;

            return vProp;
        }

        return getProxy(target, p);
    },
    // Forward all proxy properties to the target's value
    getPrototypeOf(target) {
        const value = getNodeValue(target);
        return Reflect.getPrototypeOf(value);
    },
    ownKeys(target: NodeValue) {
        const value = getNodeValue(target);
        const keys = value ? Reflect.ownKeys(value) : [];

        // Update that this node was accessed for observers
        if (tracking.nodes) {
            updateTracking(target, undefined, true);
        }

        // This is required to fix this error:
        // TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported non-configurability for
        // property 'length' which is either non-existent or configurable in the proxy target
        if (isArray(value)) {
            if (keys[keys.length - 1] === 'length') {
                keys.splice(keys.length - 1, 1);
            }
        }
        return keys;
    },
    getOwnPropertyDescriptor(target, p) {
        const value = getNodeValue(target);
        return Reflect.getOwnPropertyDescriptor(value, p);
    },
    set(target, prop, value) {
        // If this assignment comes from within an observable function it's allowed
        if (inSetFn) {
            Reflect.set(target, prop, value);
            return true;
        } else {
            return false;
        }
    },
    deleteProperty(target, prop) {
        // If this delete comes from within an observable function it's allowed
        if (inSetFn) {
            Reflect.deleteProperty(target, prop);
            return true;
        } else {
            return false;
        }
    },
    has(target, prop) {
        const value = getNodeValue(target);
        return Reflect.has(value, prop);
    },
};

function set(node: NodeValue, keyOrNewValue: any, newValue?: any) {
    if (arguments.length > 2) {
        return setProp(node, keyOrNewValue, newValue);
    } else if (node.root.isPrimitive) {
        return setProp(node, 'current', keyOrNewValue);
    } else if (!node.parent) {
        return set(node, undef, keyOrNewValue);
    } else {
        return setProp(node.parent, node.key, keyOrNewValue);
    }
}

function setProp(node: NodeValue, key: string | number, newValue?: any, level?: number) {
    inSetFn = true;
    const isRoot = (key as any) === undef;

    // Get the child node for updating and notifying
    let childNode: NodeValue = isRoot ? node : getChildNode(node, key);

    // Set operations do not create listeners
    if (tracking.nodes) untrack(childNode);

    // Get the value of the parent
    let parentValue = isRoot ? node.root : getNodeValue(node);

    if (isRoot) {
        key = '_';
    }

    // Save the previous value first
    const prevValue = parentValue[key];

    // Compute newValue if newValue is a function or an observable
    newValue = isFunction(newValue)
        ? newValue(prevValue)
        : isObject(newValue) && newValue?.[symbolIsObservable as any]
        ? newValue.get()
        : newValue;

    const isPrim = isPrimitive(newValue);

    // Save the new value
    parentValue[key] = newValue;

    // Make sure we don't call too many listeners for ever property set
    observableBatcher.begin();

    let hasADiff = isPrim;
    // If new value is an object or array update notify down the tree
    if (!isPrim) {
        hasADiff = updateNodes(childNode, newValue, prevValue);
    }

    // Notify for this element if it's an object or it's changed
    if (!isPrim || newValue !== prevValue) {
        notify(
            node.root.isPrimitive ? node : childNode,
            newValue,
            prevValue,
            level ?? prevValue === undefined ? -1 : hasADiff ? 0 : 1
        );
    }

    observableBatcher.end();

    inSetFn = false;

    return isRoot ? getProxy(node) : getProxy(node, key);
}

function createPreviousHandler(value: any, path: (string | number)[], prevAtPath: any) {
    // Create a function that clones the current state and injects the previous data at the changed path
    return function () {
        let clone = value ? JSON.parse(JSON.stringify(value)) : path.length > 0 ? {} : value;
        let o = clone;
        if (path.length > 0) {
            let i: number;
            for (i = 0; i < path.length - 1; i++) {
                o = o[path[i]];
            }
            o[path[i]] = prevAtPath;
        } else {
            clone = prevAtPath;
        }
        return clone;
    };
}

function _notify(
    node: NodeValue,
    value: any,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any,
    level: number
) {
    const listeners = node.listeners;
    if (listeners) {
        let getPrevious;
        for (let listener of listeners) {
            // Notify if listener is not shallow or if this is the first level
            if (!listener.shallow || level <= 0) {
                // Create a function to get the previous data. Computing a clone of previous data can be expensive if doing
                // it often, so leave it up to the caller.
                if (!getPrevious) {
                    getPrevious = createPreviousHandler(value, path, prevAtPath);
                }
                observableBatcherNotify({ cb: listener, value, getPrevious, path, valueAtPath, prevAtPath, node });
            }
        }
    }
}

function _notifyParents(
    node: NodeValue,
    value: any,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any,
    level: number
) {
    // Do the notify
    _notify(node, value, path, valueAtPath, prevAtPath, level);
    // If not root notify up through parents
    if (node.parent) {
        const parent = node.parent;
        if (parent) {
            const parentValue = getNodeValue(parent);
            _notifyParents(parent, parentValue, [node.key].concat(path), valueAtPath, prevAtPath, level + 1);
        }
    }
}
function notify(node: NodeValue, value: any, prev: any, level: number) {
    // Start notifying up through parents with the listenerInfo
    _notifyParents(node, value, [], value, prev, level);
}

function assign(node: NodeValue, value: any) {
    // Set operations do not create listeners
    if (tracking.nodes) untrack(node);

    observableBatcher.begin();

    // Assign calls set with all assigned properties
    const keys = Object.keys(value);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        setProp(node, keys[i], value[keys[i]]);
    }

    const ret = getNodeValue(node);
    observableBatcher.end();

    return ret;
}

function deleteFn(node: NodeValue, key?: string | number) {
    // If called without a key, delete by key from the parent node
    if (key !== undefined) {
        return deleteFnByKey(node, key);
    } else if (node.parent) {
        return deleteFnByKey(node.parent, node.key);
    }
}
function deleteFnByKey(node: NodeValue, key: string | number) {
    if (!node.root.isPrimitive) {
        // delete sets to undefined first to notify
        setProp(node, key, undefined, /*level*/ -1);
    }

    inSetFn = true;
    // Then delete the key from the object
    let child = getNodeValue(node);
    delete child[key];

    inSetFn = false;
}

export function observable<T extends object>(obj: T): ObservableObjectOrPrimitive<T>;
export function observable<T extends boolean>(prim: T): ObservablePrimitive<boolean>;
export function observable<T extends string>(prim: T): ObservablePrimitive<string>;
export function observable<T extends number>(prim: T): ObservablePrimitive<number>;
export function observable<T extends boolean | string | number>(prim: T): ObservablePrimitive<T>;
export function observable<T>(obj: T): ObservableObjectOrPrimitive<T> {
    const isPrim = isPrimitive(obj);
    // Primitives wrap in current
    if (isPrim) {
        obj = { current: obj } as any;
    }

    const obs = {
        _: obj as Observable<T>,
        isPrimitive: isPrim,
    } as ObservableWrapper;

    const node: NodeValue = {
        id: nextNodeID.current++,
        root: obs,
        parent: undefined,
        key: undefined,
    };

    return getProxy(node) as ObservableObjectOrPrimitive<T>;
}
