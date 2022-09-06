import { checkTracking, get, getChildNode, getNodeValue, nextNodeID, symbolIsObservable, Tracking } from './globals';
import { isArray, isBoolean, isFunction, isObject, isPrimitive, isSymbol } from './is';
import { observableBatcher, observableBatcherNotify } from './observableBatcher';
import {
    NodeValue,
    Observable,
    ObservableObjectOrPrimitive,
    ObservableObjectOrPrimitiveSafe,
    ObservablePrimitive,
    ObservableWrapper,
} from './observableInterfaces';
import { onChange, onChangeShallow, onEquals, onHasValue, onTrue } from './on';
import { tracking, untrack, updateTracking } from './tracking';

let lastAccessedNode: NodeValue;
let lastAccessedPrimitive: string;
let inSetFn = false;
let inAssign = false;
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
    ['ref', ref],
    ['onChange', onChange],
    ['onChangeShallow', onChangeShallow],
    ['onEquals', onEquals],
    ['onHasValue', onHasValue],
    ['onTrue', onTrue],
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

    let keyMap: Map<string | number, number>;
    let moved: [string, NodeValue][];

    // If array it's faster to just use the array
    const keys = isArr ? obj : obj ? Object.keys(obj) : [];
    // let isArrayOptimized = false;
    let arrayHasOptimized = false;

    let idField: string;

    if (isArr && isArray(prevValue)) {
        // Construct a map of previous indices for computing move
        if (prevValue?.length > 0) {
            if (parent.listeners) {
                // isArrayOptimized = true;
                arrayHasOptimized = false;
                for (let listenerFn of parent.listeners) {
                    // if listener is not optimized
                    if (listenerFn[0][0] === 'o') {
                        arrayHasOptimized = true;
                        break;
                    }
                }
            }
            const p = prevValue[0];
            if (p) {
                idField =
                    p.id !== undefined ? 'id' : p._id !== undefined ? '_id' : p.__id !== undefined ? '__id' : undefined;

                if (idField) {
                    keyMap = new Map();
                    moved = [];
                    for (let i = 0; i < prevValue.length; i++) {
                        const p = prevValue[i];
                        if (p) {
                            keyMap.set(p[idField], i);
                        }
                    }
                }
            }
        }
    } else if (prevValue && (!obj || obj.hasOwnProperty)) {
        // For keys that have been removed from object, notify and update children recursively
        const keysPrev = Object.keys(prevValue);
        const lengthPrev = keysPrev.length;
        for (let i = 0; i < lengthPrev; i++) {
            const key = keysPrev[i];
            if (!keys.includes(key)) {
                let child = getChildNode(parent, key);

                const prev = prevValue[key];
                if (!isPrimitive(prev)) {
                    updateNodes(child, undefined, prev);
                }
                const doNotify = !!child.listeners;

                if (doNotify) {
                    _notify(child, undefined, [], undefined, prev, 0);
                }
            }
        }
    }

    if (obj) {
        const length = keys.length;

        let hasADiff = !isArr || obj?.length !== prevValue?.length;
        const isArrDiff = hasADiff;
        let didMove = false;

        for (let i = 0; i < length; i++) {
            const key = isArr ? i : keys[i];
            const value = obj[key];
            const prev = prevValue?.[key];

            let isDiff = value !== prev;
            if (isDiff) {
                const id = value?.[idField];

                let child = getChildNode(parent, key);

                // Detect moves within an array. Need to move the original proxy to the new position to keep
                // the proxy stable, so that listeners to this node will be unaffected by the array shift.
                if (isArr && id !== undefined) {
                    // Find the previous position of this element in the array
                    const keyChild = id !== undefined ? keyMap?.get(id) : undefined;
                    if (keyChild !== undefined) {
                        if (keyChild !== key) {
                            // If array length changed then move the original node to the current position.
                            // That should be faster than notifying every single element that
                            // it's in a new position.
                            if (isArrDiff) {
                                child = getChildNode(parent, keyChild);
                                child.key = key;
                                moved.push([key, child]);
                            }

                            didMove = true;

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
                        _notify(child, value, [], value, prev, 0, !isArrDiff);
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

        // TODO: !isArrDiff should only be for optimized listeners

        // The full array does not need to re-render if the length is the same
        // So don't notify shallow listeners
        return hasADiff || didMove;
    }
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
function ref(node: NodeValue, keyOrTrack?: string | number | boolean | Symbol, track?: boolean | Symbol) {
    if (isBoolean(keyOrTrack) || isSymbol(keyOrTrack)) {
        track = keyOrTrack;
        keyOrTrack = undefined;
    }

    if (keyOrTrack !== undefined) {
        node = getChildNode(node, keyOrTrack as string | number);
    }

    // Untrack by default
    checkTracking(node, track === true ? Tracking.Normal : track === false ? undefined : track);

    return getProxy(node);
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
            if (p !== 'get' && p !== 'ref') {
                // Observable operations do not create listeners
                if (tracking.nodes) untrack(node);
            }
            return function (a, b, c) {
                const l = arguments.length;
                // Array call and apply are slow so micro-optimize this hot path.
                // The observable functions depends on the number of arguments so we have to
                // call it with the correct arguments, not just undefined
                return l > 2 ? fn(node, a, b, c) : l > 1 ? fn(node, a, b) : fn(node, a);
            };
        }

        let value = getNodeValue(node);
        const vProp = value?.[p];

        // Accessing symbols passes straight through
        if (isSymbol(p)) {
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
                        updateTracking(node, undefined, Tracking.Shallow);
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

        // Accessing primitive returns the raw value
        if (vProp === undefined || vProp === null || isPrimitive(vProp)) {
            // Accessing a primitive saves the last accessed so that the observable functions
            // bound to primitives can know which node was accessed
            lastAccessedNode = node;
            lastAccessedPrimitive = p;

            // Update that this primitive node was accessed for observers
            if (tracking.nodes) {
                if (isArray(value) && p === 'length') {
                    updateTracking(node, undefined, Tracking.Shallow);
                } else {
                    updateTracking(getChildNode(node, p), node);
                }
            }

            return vProp;
        }

        // Return an observable proxy to the property
        return getProxy(target, p);
    },
    // Forward all proxy properties to the target's value
    getPrototypeOf(target) {
        const value = getNodeValue(target);
        return typeof value === 'object' ? Reflect.getPrototypeOf(value) : null;
    },
    ownKeys(target: NodeValue) {
        const value = getNodeValue(target);
        const keys = value ? Reflect.ownKeys(value) : [];

        // Update that this node was accessed for observers
        if (tracking.nodes) {
            updateTracking(target, undefined, Tracking.Shallow);
        }

        // This is required to fix this error:
        // TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported non-configurability for
        // property 'length' which is either non-existent or configurable in the proxy target
        if (isArray(value) && keys[keys.length - 1] === 'length') {
            keys.splice(keys.length - 1, 1);
        }
        return keys;
    },
    getOwnPropertyDescriptor(target, p) {
        const value = getNodeValue(target);
        return Reflect.getOwnPropertyDescriptor(value, p);
    },
    set(target: NodeValue, prop, value) {
        // If this assignment comes from within an observable function it's allowed
        if (inSetFn) {
            Reflect.set(target, prop, value);
        } else if (!inAssign && target.root.isSafe) {
            return false;
        } else {
            if (process.env.NODE_ENV === 'development' && tracking.nodes) {
                console.error(
                    `[legend-state] Should not assign to an observable within an observer. You may have done this by accident. Please use set() if you really want to do this.`
                );
            }
            set(target, prop, value);
        }
        return true;
    },
    deleteProperty(target: NodeValue, prop) {
        // If this delete comes from within an observable function it's allowed
        if (inSetFn) {
            Reflect.deleteProperty(target, prop);
        } else if (target.root.isSafe) {
            return false;
        } else {
            if (process.env.NODE_ENV === 'development' && tracking.nodes) {
                console.error(
                    `[legend-state] Should not delete an observable property within an observer. You may have done this by accident. Please use delete() if you really want to do this.`
                );
            }
            deleteFn(target, prop as any);
        }
        return true;
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
        return setProp(node, undef as any, keyOrNewValue);
    } else {
        return setProp(node.parent, node.key, keyOrNewValue);
    }
}

function setProp(node: NodeValue, key: string | number, newValue?: any, level?: number) {
    if (process.env.NODE_ENV === 'development') {
        if (typeof HTMLElement !== 'undefined' && newValue instanceof HTMLElement) {
            console.warn(`[legend-state] Set an HTMLElement into state. You probably don't want to do that.`);
        }
    }

    const isDelete = newValue === undef;
    if (isDelete) newValue = undefined;

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
    if (isDelete) {
        delete parentValue[key];
    } else {
        parentValue[key] = newValue;
    }

    // Make sure we don't call too many listeners for ever property set
    observableBatcher.begin();

    let hasADiff = isPrim;
    let whenOptimizedOnlyIf = false;
    // If new value is an object or array update notify down the tree
    if (!isPrim || !isPrimitive(prevValue)) {
        hasADiff = updateNodes(childNode, newValue, prevValue);
        if (isArray(newValue)) {
            whenOptimizedOnlyIf = newValue?.length !== prevValue?.length;
        }
    }

    // Notify for this element if it's an object or it's changed
    if (!isPrim || newValue !== prevValue) {
        notify(
            node.root.isPrimitive ? node : childNode,
            newValue,
            prevValue,
            level ?? prevValue === undefined ? -1 : hasADiff ? 0 : 1,
            whenOptimizedOnlyIf
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
    level: number,
    whenOptimizedOnlyIf?: boolean
) {
    const listeners = node.listeners;
    if (listeners) {
        let getPrevious;
        for (let listenerFn of listeners) {
            const shallow = listenerFn[0][0] === 's';
            const optimized = listenerFn[0][0] === 'o';
            const listener = listenerFn[1];

            const ok = shallow ? level <= 0 : optimized ? whenOptimizedOnlyIf && level <= 0 : true;

            // console.log('notify', shallow, optimized, ok, node);

            // Notify if listener is not shallow or if this is the first level
            if (ok) {
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
    level: number,
    whenOptimizedOnlyIf?: boolean
) {
    // Do the notify
    _notify(node, value, path, valueAtPath, prevAtPath, level, whenOptimizedOnlyIf);
    // If not root notify up through parents
    if (node.parent) {
        const parent = node.parent;
        if (parent) {
            const parentValue = getNodeValue(parent);
            _notifyParents(
                parent,
                parentValue,
                [node.key].concat(path),
                valueAtPath,
                prevAtPath,
                level + 1,
                whenOptimizedOnlyIf
            );
        }
    }
}
function notify(node: NodeValue, value: any, prev: any, level: number, whenOptimizedOnlyIf?: boolean) {
    // Start notifying up through parents with the listenerInfo
    _notifyParents(node, value, [], value, prev, level, whenOptimizedOnlyIf);
}

function assign(node: NodeValue, value: any) {
    // Set operations do not create listeners
    if (tracking.nodes) untrack(node);

    const proxy = getProxy(node);

    observableBatcher.begin();

    // Set inAssign to allow setting on safe observables
    inAssign = true;
    Object.assign(proxy, value);
    inAssign = false;

    observableBatcher.end();

    return proxy;
}

function deleteFn(node: NodeValue, key?: string | number) {
    // If called without a key, delete by key from the parent node
    if (key === undefined && node.parent) {
        key = node.key;
        node = node.parent;
    }
    if (!node.root.isPrimitive) {
        // delete sets to undefined first to notify
        setProp(node, key, undef, /*level*/ -1);
    }
}

export function observable<T extends object>(obj: T, safe: true): ObservableObjectOrPrimitiveSafe<T>;
export function observable<T extends object>(obj: T, safe?: boolean): ObservableObjectOrPrimitive<T>;
export function observable<T extends boolean>(prim: T, safe?: boolean): ObservablePrimitive<boolean>;
export function observable<T extends string>(prim: T, safe?: boolean): ObservablePrimitive<string>;
export function observable<T extends number>(prim: T, safe?: boolean): ObservablePrimitive<number>;
export function observable<T extends boolean | string | number>(prim: T, safe?: boolean): ObservablePrimitive<T>;
export function observable<T>(obj: T, safe?: boolean): ObservableObjectOrPrimitive<T> {
    const isPrim = isPrimitive(obj);
    // Primitives wrap in current
    if (isPrim) {
        obj = { current: obj } as any;
    }

    const obs = {
        _: obj as Observable<T>,
        isPrimitive: isPrim,
        isSafe: safe,
    } as ObservableWrapper;

    const node: NodeValue = {
        id: nextNodeID.current++,
        root: obs,
        parent: undefined,
        key: undefined,
    };

    return getProxy(node) as ObservableObjectOrPrimitive<T>;
}
