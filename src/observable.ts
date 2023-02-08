import { beginBatch, endBatch } from './batching';
import {
    ensureNodeValue,
    extraPrimitiveActivators,
    extraPrimitiveProps,
    findIDKey,
    get,
    getChildNode,
    getNodeValue,
    IDKey,
    nextNodeID,
    peek,
    symbolDelete,
    symbolGetNode,
    symbolIsEvent,
    symbolIsObservable,
    symbolOpaque,
} from './globals';
import {
    isActualPrimitive,
    isArray,
    isBoolean,
    isChildNodeValue,
    isFunction,
    isObject,
    isPrimitive,
    isPromise,
} from './is';
import { doNotify, notify } from './notify';
import type {
    ChildNodeValue,
    NodeValue,
    Observable,
    ObservableObjectOrArray,
    ObservablePrimitive,
    ObservableWrapper as ObservableRoot,
} from './observableInterfaces';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { onChange } from './onChange';
import { updateTracking } from './tracking';

let inSet = false;
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
    ['peek', peek],
    ['onChange', onChange],
    ['assign', assign],
    ['delete', deleteFn],
    ['toggle', toggle],
]);

if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    var __devUpdateNodes = new Set();
}
function collectionSetter(node: NodeValue, target: any, prop: string, ...args: any[]) {
    const prevValue = (isArray(target) && target.slice()) || target;

    const ret = (target[prop] as Function).apply(target, args);

    if (node) {
        const hasParent = isChildNodeValue(node);
        const key: string | number = hasParent ? node.key : '_';
        const parentValue = hasParent ? getNodeValue(node.parent) : node.root;

        // Set the object to the previous value first
        parentValue[key] = prevValue;

        // Then set with the new value so it notifies with the correct prevValue
        setKey(node.parent ?? node, hasParent ? key : undefined, target);
    }

    // Return the original value
    return ret;
}

function updateNodes(parent: NodeValue, obj: Record<any, any> | Array<any> | undefined, prevValue: any): boolean {
    if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && obj !== undefined) {
        if (__devUpdateNodes.has(obj)) {
            console.error(
                '[legend-state] Circular reference detected in object. You may way to use opaqueObject to stop traversing child nodes.',
                obj
            );
            return false;
        }
        __devUpdateNodes.add(obj);
    }
    if ((isObject(obj) && obj[symbolOpaque as any]) || (isObject(prevValue) && prevValue[symbolOpaque as any])) {
        const isDiff = obj !== prevValue;
        if (isDiff) {
            if (parent.listeners) {
                doNotify(parent, obj, [], [], obj, prevValue, 0);
            }
        }
        return isDiff;
    }
    const isArr = isArray(obj);

    let prevChildrenById: Map<string | number, ChildNodeValue> | undefined;
    let moved: [string | number, ChildNodeValue][] | undefined;

    // If array it's faster to just use the array
    const keys: string[] = isArr ? obj : obj ? Object.keys(obj) : [];

    let idField: IDKey | undefined;
    let hasADiff = false;

    if (isArr && isArray(prevValue)) {
        // Construct a map of previous indices for computing move
        if (prevValue.length > 0) {
            const firstPrevValue = prevValue[0];
            if (firstPrevValue) {
                idField = findIDKey(firstPrevValue);

                if (idField) {
                    prevChildrenById = new Map();
                    moved = [];
                    if (parent.children) {
                        for (let i = 0; i < prevValue.length; i++) {
                            const p = prevValue[i];
                            if (p) {
                                const child = parent.children.get(i);
                                if (child) {
                                    prevChildrenById.set(p[idField], child);
                                }
                            }
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
                hasADiff = true;
                let child = getChildNode(parent, key);

                const prev = prevValue[key];
                if (!isPrimitive(prev)) {
                    updateNodes(child, undefined, prev);
                }

                if (child.listeners) {
                    doNotify(child, undefined, [], [], undefined, prev, 0);
                }
            }
        }
    }

    if (obj && !isPrimitive(obj)) {
        const length = keys.length;

        hasADiff = hasADiff || obj?.length !== prevValue?.length;
        const isArrDiff = hasADiff;
        let didMove = false;

        for (let i = 0; i < length; i++) {
            const key = isArr ? i : keys[i];
            const value = (obj as any)[key];
            const prev = prevValue?.[key];

            let isDiff = value !== prev;
            if (isDiff) {
                const id = value?.[idField as IDKey];

                let child = getChildNode(parent, key);

                // Detect moves within an array. Need to move the original proxy to the new position to keep
                // the proxy stable, so that listeners to this node will be unaffected by the array shift.
                if (isArr && id !== undefined) {
                    // Find the previous position of this element in the array
                    const prevChild = id !== undefined ? prevChildrenById?.get(id) : undefined;
                    if (!prevChild) {
                        // This id was not in the array before so it does not need to notify children
                        isDiff = false;
                        hasADiff = true;
                    } else if (prevChild !== undefined && prevChild.key !== key) {
                        // If array length changed then move the original node to the current position.
                        // That should be faster than notifying every single element that
                        // it's in a new position.
                        if (isArrDiff) {
                            child = prevChild;
                            parent.children!.delete(child.key);
                            child.key = key;
                            moved!.push([key, child]);
                        }

                        didMove = true;

                        // And check for diff against the previous value in the previous position
                        const prevOfNode = prevChild;
                        isDiff = prevOfNode !== value;
                    }
                }

                if (isDiff) {
                    // Array has a new / modified element
                    // If object iterate through its children
                    if (isPrimitive(value)) {
                        hasADiff = true;
                    } else {
                        hasADiff = hasADiff || updateNodes(child, value, prev);
                    }
                }
                if (isDiff || !isArrDiff) {
                    // Notify for this child if this element is different and it has listeners
                    // Or if the position changed in an array whose length did not change
                    // But do not notify child if the parent is an array with changing length -
                    // the array's listener will cover it
                    if (child.listeners) {
                        doNotify(child, value, [], [], value, prev, 0, !isArrDiff);
                    }
                }
            }
        }

        if (moved) {
            for (let i = 0; i < moved.length; i++) {
                const [key, child] = moved[i];
                parent.children!.set(key, child);
            }
        }

        // The full array does not need to re-render if the length is the same
        // So don't notify shallow listeners
        return hasADiff || didMove;
    } else if (prevValue !== undefined) {
        // If value got set to undefined, it has a diff
        return true;
    }
    return false;
}

function getProxy(node: NodeValue, p?: string | number) {
    // Get the child node if p prop
    if (p !== undefined) node = getChildNode(node, p);

    // Create a proxy if not already cached and return it
    return node.proxy || (node.proxy = new Proxy<NodeValue>(node, proxyHandler));
}

const proxyHandler: ProxyHandler<any> = {
    get(node: NodeValue, p: any) {
        // Return true is called by isObservable()
        if (p === symbolIsObservable) {
            return true;
        }
        if (p === symbolIsEvent) {
            return false;
        }
        if (p === symbolGetNode) {
            return node;
        }

        const fn = node.fns?.[p] ?? objectFns.get(p);
        // If this is an observable function, call it
        if (fn) {
            return function (a: unknown, b: unknown, c: unknown) {
                const l = arguments.length;
                // Array call and apply are slow so micro-optimize this hot path.
                // The observable functions depends on the number of arguments so we have to
                // call it with the correct arguments, not just undefined
                return l > 2 ? fn(node, a, b, c) : l > 1 ? fn(node, a, b) : fn(node, a);
            };
        }

        let value = peek(node);

        const isValuePrimitive = isPrimitive(value);

        // If accessing a key that doesn't already exist, and this node has been activated with extra keys
        // then return the values that were set. This is used by enableLegendStateReact for example.
        if (value === undefined || value === null || isValuePrimitive) {
            if (extraPrimitiveProps.size && (node.isActivatedPrimitive || extraPrimitiveActivators.has(p))) {
                node.isActivatedPrimitive = true;
                const vPrim = extraPrimitiveProps.get(p);
                if (vPrim !== undefined) {
                    return isFunction(vPrim) ? vPrim(getProxy(node)) : vPrim;
                }
            }
        }

        const vProp = value?.[p];

        if (isObject(value) && value[symbolOpaque as any]) {
            return vProp;
        }

        // Handle function calls
        if (isFunction(vProp)) {
            if (isArray(value)) {
                if (ArrayModifiers.has(p)) {
                    // Call the wrapped modifier function
                    return (...args: any[]) => collectionSetter(node, value, p, ...args);
                } else if (ArrayLoopers.has(p)) {
                    // Update that this node was accessed for observers
                    // Listen to the array shallowly
                    updateTracking(node, true);
                    return function (cbOrig: any, thisArg: any) {
                        function cb(_: any, index: number, array: any[]) {
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
        if (isPrimitive(vProp)) {
            // Update that this primitive node was accessed for observers
            if (isArray(value) && p === 'length') {
                updateTracking(node, true);
                // } else if (!isPrimitive(value)) {
                //     updateTracking(getChildNode(node, p));
                return vProp;
            }
        }

        // Return an observable proxy to the property
        return getProxy(node, p);
    },
    // Forward all proxy properties to the target's value
    getPrototypeOf(node) {
        const value = getNodeValue(node);
        return value !== null && typeof value === 'object' ? Reflect.getPrototypeOf(value) : null;
    },
    ownKeys(node: NodeValue) {
        const value = getNodeValue(node);
        if (isPrimitive(value)) return [];

        const keys = value ? Reflect.ownKeys(value) : [];

        // Update that this node was accessed for observers
        updateTracking(node, true);

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
        if (inSet) {
            return Reflect.set(node, prop, value);
        }

        if (!inAssign) {
            return false;
        }

        setKey(node, prop, value);
        return true;
    },
    deleteProperty(target: NodeValue, prop) {
        // If this delete comes from within an observable function it's allowed
        if (inSet) {
            return Reflect.deleteProperty(target, prop);
        } else {
            return false;
        }
    },
    has(target, prop) {
        const value = getNodeValue(target);
        return Reflect.has(value, prop);
    },
};

export function set(node: NodeValue, newValue?: any) {
    if (!node.parent) {
        return setKey(node, undefined, newValue);
    } else {
        return setKey(node.parent, node.key, newValue);
    }
}
function toggle(node: NodeValue) {
    const value = getNodeValue(node);
    if (value === undefined || isBoolean(value)) {
        set(node, !value);
        return !value;
    } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        throw new Error('[legend-state] Cannot toggle a non-boolean value');
    }
}

function setKey(node: NodeValue, key: string | number, newValue?: any, level?: number) {
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

    const isDelete = newValue === symbolDelete;
    if (isDelete) newValue = undefined;

    const isRoot = !node.parent && key === undefined;
    if (isRoot) {
        key = '_';
    }

    // Get the child node for updating and notifying
    let childNode: NodeValue = isRoot ? node : getChildNode(node, key);

    // Get the value of the parent
    let parentValue = isRoot ? node.root : ensureNodeValue(node);

    // Save the previous value first
    const prevValue = parentValue[key];

    // Compute newValue if newValue is a function or an observable
    newValue =
        !inAssign && isFunction(newValue)
            ? newValue(prevValue)
            : isObject(newValue) && newValue?.[symbolIsObservable as any]
            ? newValue.get()
            : newValue;

    const isPrim = isPrimitive(newValue) || newValue instanceof Date;

    inSet = true;
    // Save the new value
    if (isDelete) {
        delete parentValue[key];
    } else {
        parentValue[key] = newValue;
    }
    inSet = false;

    // Make sure we don't call too many listeners for ever property set
    beginBatch();

    let hasADiff = isPrim;
    let whenOptimizedOnlyIf = false;
    // If new value is an object or array update notify down the tree
    if (!isPrim || (prevValue && !isPrimitive(prevValue))) {
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            __devUpdateNodes.clear();
        }
        hasADiff = updateNodes(childNode, newValue, prevValue);
        if (isArray(newValue)) {
            whenOptimizedOnlyIf = newValue?.length !== prevValue?.length;
        }
    }

    if (isPrim ? newValue !== prevValue : hasADiff) {
        // Notify for this element if something inside it has changed
        notify(
            isPrim && isRoot ? node : childNode,
            newValue,
            prevValue,
            level ?? prevValue === undefined ? -1 : hasADiff ? 0 : 1,
            whenOptimizedOnlyIf
        );
    }

    endBatch();

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
    try {
        Object.assign(proxy, value);
    } finally {
        inAssign = false;
    }

    endBatch();

    return proxy;
}

function deleteFn(node: NodeValue, key?: string | number) {
    // If called without a key, delete by key from the parent node
    if (key === undefined && isChildNodeValue(node)) {
        key = node.key;
        node = node.parent;
    }
    // delete sets to undefined first to notify
    setKey(node, key as string | number, symbolDelete, /*level*/ -1);
}

function createObservable<T>(value?: T | Promise<T>, makePrimitive?: true): ObservablePrimitive<T>;
function createObservable<T>(
    value?: T | Promise<T>,
    makePrimitive?: boolean
): ObservablePrimitive<T> | ObservableObjectOrArray<T> {
    const valueIsPromise = isPromise<T>(value);
    const root: ObservableRoot = {
        _: valueIsPromise ? undefined : value,
    };

    const node: NodeValue = {
        id: nextNodeID.current++,
        root,
    };

    const obs =
        makePrimitive || isActualPrimitive(value)
            ? (new (ObservablePrimitiveClass as any)(node) as ObservablePrimitive<T>)
            : (getProxy(node) as ObservableObjectOrArray<T>);

    if (valueIsPromise) {
        value.catch((error) => {
            obs.set({ error } as any);
        });
        value.then((value) => {
            obs.set(value);
        });
    }

    return obs;
}

export function observable<T>(value?: T | Promise<T>): Observable<T> {
    return createObservable(value) as Observable<T>;
}

export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T> {
    return createObservable<T>(value, /*makePrimitive*/ true);
}
