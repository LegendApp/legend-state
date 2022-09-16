import {
    extraPrimitiveProps,
    get,
    getChildNode,
    getNodeValue,
    nextNodeID,
    symbolGetNode,
    symbolIsObservable,
    Tracking,
    symbolUndef,
} from './globals';
import { isArray, isBoolean, isFunction, isObject, isPrimitive, isSymbol } from './is';
import { beginBatch, endBatch, batchNotify } from './batching';
import {
    NodeValue,
    Observable,
    ObservableObjectOrPrimitive,
    ObservableObjectOrPrimitiveDefault,
    ObservableObjectOrPrimitiveSafe,
    ObservablePrimitive,
    ObservableWrapper,
} from './observableInterfaces';
import { onChange } from './onChange';
import { checkTracking, tracking, untrack, updateTracking } from './tracking';
import { doNotify, notify } from './notify';

let lastAccessedNode: NodeValue;
let lastAccessedPrimitive: string;
let inSetFn = false;
let inAssign = false;

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
const ArrayLoopers = new Set<keyof Array<any>>(['every', 'some', 'filter', 'forEach', 'map', 'join']);

const objectFns = new Map<string, Function>([
    ['get', get],
    ['set', set],
    ['obs', obs],
    ['onChange', onChange],
    ['assign', assign],
    ['delete', deleteFn],
]);

// Override primitives
const wrapFn = (name: string, fn: Function) =>
    function (...args: any) {
        if (lastAccessedNode && lastAccessedPrimitive) {
            const node: NodeValue = getChildNode(lastAccessedNode, lastAccessedPrimitive);
            if (getNodeValue(node) === this) {
                return fn(node, ...args);
            } else if (process.env.NODE_ENV === 'development') {
                console.error(
                    `[legend-state] Error calling ${name} on a primitive with value [${this}]. Please ensure that if you are saving references to observable functions on primitive values that you use obs() first, like obs.primitive.obs().set.`
                );
                debugger;
            }
        }
    };

const toOverride = [Number, Boolean, String];
for (let [key, fn] of objectFns) {
    for (let i = 0; i < toOverride.length; i++) {
        toOverride[i].prototype[key] = wrapFn(key, fn);
    }
}

function collectionSetter(node: NodeValue, target: any, prop: string, ...args: any[]) {
    const prevValue = (isArray(target) && target.slice()) || target;

    const ret = (target[prop] as Function).apply(target, args);

    if (node) {
        const parent = node.parent;
        const key = parent ? node.key : '_';
        const parentValue = parent ? getNodeValue(parent) : node.root;

        // Set the object to the previous value first
        parentValue[key] = prevValue;

        // Then set with the new value so it notifies with the correct prevValue
        setProp(parent || node, parent ? key : (symbolUndef as any), target);
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

    let idField: string;

    if (isArr && isArray(prevValue)) {
        // Construct a map of previous indices for computing move
        if (prevValue?.length > 0) {
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

                if (child.listeners) {
                    doNotify(child, undefined, [], undefined, prev, 0);
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
                    if (child.listeners) {
                        doNotify(child, value, [], value, prev, 0, !isArrDiff);
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

        // The full array does not need to re-render if the length is the same
        // So don't notify shallow listeners
        return hasADiff || didMove;
    }
}

function getProxy(node: NodeValue, p?: string | number) {
    // Get the child node if p prop
    if (p !== undefined) node = getChildNode(node, p);

    // Create a proxy if not already cached and return it
    return node.proxy || (node.proxy = new Proxy<NodeValue>(node, proxyHandler));
}
function obs(node: NodeValue, keyOrTrack?: string | number | boolean | Symbol, track?: boolean | Symbol) {
    if (isBoolean(keyOrTrack) || isSymbol(keyOrTrack)) {
        track = keyOrTrack;
        keyOrTrack = undefined;
    }

    if (keyOrTrack !== undefined) {
        node = getChildNode(node, keyOrTrack as string | number);
    }

    // Don't untrack if getting node by key
    if (track !== undefined || !keyOrTrack) {
        // Untrack by default
        checkTracking(node, track === true ? Tracking.normal : track === false ? undefined : track);
    }

    return getProxy(node);
}

const proxyHandler: ProxyHandler<any> = {
    get(node: NodeValue, p: any) {
        // Return true is called by isObservable()
        if (p === symbolIsObservable) {
            return true;
        }
        if (p === symbolGetNode) {
            return node;
        }

        const fn = objectFns.get(p);
        // If this is an observable function, call it
        if (fn) {
            return function (a, b, c) {
                const l = arguments.length;
                // Array call and apply are slow so micro-optimize this hot path.
                // The observable functions depends on the number of arguments so we have to
                // call it with the correct arguments, not just undefined
                return l > 2 ? fn(node, a, b, c) : l > 1 ? fn(node, a, b) : fn(node, a);
            };
        }

        let value = getNodeValue(node);

        if (!node.parent && isPrimitive(value) && node.root._ === value && p === 'value') {
            updateTracking(node);
            return value;
        }

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
                    updateTracking(node, Tracking.shallow);
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
            if (extraPrimitiveProps.size) {
                const vPrim = extraPrimitiveProps.get(p);
                if (vPrim !== undefined) {
                    return vPrim?.__fn?.(node) ?? vPrim;
                }
            }
            // Accessing a primitive saves the last accessed so that the observable functions
            // bound to primitives can know which node was accessed
            lastAccessedNode = node;
            lastAccessedPrimitive = p;

            // Update that this primitive node was accessed for observers
            if (tracking.isTracking) {
                if (isArray(value) && p === 'length') {
                    updateTracking(node, Tracking.shallow);
                } else if (!isPrimitive(value)) {
                    updateTracking(getChildNode(node, p));
                }
            }

            return vProp;
        }

        // Return an observable proxy to the property
        return getProxy(node, p);
    },
    // Forward all proxy properties to the target's value
    getPrototypeOf(node) {
        const value = getNodeValue(node);
        return typeof value === 'object' ? Reflect.getPrototypeOf(value) : null;
    },
    ownKeys(node: NodeValue) {
        const value = getNodeValue(node);
        if (isPrimitive(value)) return [];

        const keys = value ? Reflect.ownKeys(value) : [];

        // Update that this node was accessed for observers
        updateTracking(node, Tracking.shallow);

        // This is required to fix this error:
        // TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported non-configurability for
        // property 'length' which is either non-existent or configurable in the proxy node
        if (isArray(value) && keys[keys.length - 1] === 'length') {
            keys.splice(keys.length - 1, 1);
        }
        return keys;
    },
    getOwnPropertyDescriptor(node, p) {
        const value = getNodeValue(node);
        return !isPrimitive(value) ? Reflect.getOwnPropertyDescriptor(value, p) : undefined;
    },
    set(node: NodeValue, prop: string, value) {
        // If this assignment comes from within an observable function it's allowed
        if (inSetFn) {
            return Reflect.set(node, prop, value);
        }

        if (!inAssign && node.root.safeMode) {
            // Don't allow in safe mode
            if (node.root.safeMode === 2) return false;

            // Don't allow set on objects in default mode
            const existing = getNodeValue(getChildNode(node, prop));
            if (isObject(existing) || isArray(existing) || isObject(value) || isArray(value)) {
                return false;
            }
        }

        if (process.env.NODE_ENV === 'development' && tracking.isTracking) {
            console.error(
                `[legend-state] Should not assign to an observable within an observer. You may have done this by accident. Please use set() if you really want to do this.`
            );
        }
        set(node, prop, value);
        return true;
    },
    deleteProperty(target: NodeValue, prop) {
        // If this delete comes from within an observable function it's allowed
        if (inSetFn) {
            Reflect.deleteProperty(target, prop);
        } else if (target.root.safeMode) {
            return false;
        } else {
            if (process.env.NODE_ENV === 'development' && tracking.isTracking) {
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
    } else if (!node.parent) {
        return setProp(node, symbolUndef as any, keyOrNewValue);
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

    if (node.root.locked) {
        throw new Error(
            process.env.NODE_ENV === 'development'
                ? '[legend-state] Cannot modify an observable while it is locked. Please make sure that you unlock the observable before making changes.'
                : '[legend-state] Modified locked observable'
        );
    }

    const isDelete = newValue === symbolUndef;
    if (isDelete) newValue = undefined;

    inSetFn = true;
    const isRoot = (key as any) === symbolUndef || (!node.parent && key === 'value' && isPrimitive(newValue));

    // Get the child node for updating and notifying
    let childNode: NodeValue = isRoot ? node : getChildNode(node, key);

    // Set operations do not create listeners
    untrack(childNode);

    // Get the value of the parent
    let parentValue = isRoot ? node.root : getNodeValue(node);

    if (isRoot) {
        key = '_';
    }

    // Save the previous value first
    const prevValue = parentValue[key];

    // Compute newValue if newValue is a function or an observable
    newValue =
        !inAssign && isFunction(newValue)
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
    beginBatch();

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
            isPrim && isRoot ? node : childNode,
            newValue,
            prevValue,
            level ?? prevValue === undefined ? -1 : hasADiff ? 0 : 1,
            whenOptimizedOnlyIf
        );
    }

    endBatch();

    inSetFn = false;

    return isRoot ? getProxy(node) : getProxy(node, key);
}

function assign(node: NodeValue, value: any) {
    const proxy = getProxy(node);

    beginBatch();

    if (isPrimitive(node.root._)) {
        node.root._ = {};
    }

    // Set inAssign to allow setting on safe observables
    inAssign = true;
    Object.assign(proxy, value);
    inAssign = false;

    endBatch();

    return proxy;
}

function deleteFn(node: NodeValue, key?: string | number) {
    // If called without a key, delete by key from the parent node
    if (key === undefined && node.parent) {
        key = node.key;
        node = node.parent;
    }
    // delete sets to undefined first to notify
    setProp(node, key, symbolUndef, /*level*/ -1);
}

export function observable<T extends boolean>(value: T | Promise<T>, safe?: boolean): ObservablePrimitive<boolean>;
export function observable<T extends string>(value: T | Promise<T>, safe?: boolean): ObservablePrimitive<string>;
export function observable<T extends number>(value: T | Promise<T>, safe?: boolean): ObservablePrimitive<number>;
export function observable<T extends object>(value: T | Promise<T>, safe: true): ObservableObjectOrPrimitiveSafe<T>;
export function observable<T extends object>(value: T | Promise<T>, safe: false): ObservableObjectOrPrimitive<T>;
export function observable<T extends object>(
    value: T | Promise<T>,
    safe?: undefined
): ObservableObjectOrPrimitiveDefault<T>;
export function observable<T extends boolean | string | number>(
    value: T | Promise<T>,
    safe?: boolean
): ObservablePrimitive<T>;
export function observable<T extends unknown>(value: T | Promise<T>, safe?: boolean): ObservablePrimitive<unknown>;
export function observable<T>(value: T | Promise<T>, safe?: boolean): ObservableObjectOrPrimitive<T> {
    const promise = (value as any)?.then && (value as unknown as Promise<T>);
    if (promise) {
        value = undefined;
    }
    const obs = {
        _: promise ? undefined : (value as Observable<T>),
        safeMode: safe === true ? 2 : safe === false ? 0 : 1,
    } as ObservableWrapper;

    const node: NodeValue = {
        id: nextNodeID.current++,
        root: obs,
    };

    const proxy = getProxy(node) as ObservableObjectOrPrimitive<T>;

    if (promise) {
        promise.catch((error) => {
            proxy.set({ error } as any);
        });
        promise.then((value) => {
            proxy.set(value);
        });
    }

    return proxy;
}
