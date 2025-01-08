import { beginBatch, createPreviousHandler, endBatch, isArraySubset, notify } from './batching';
import { createObservable } from './createObservable';
import {
    equals,
    extractFunction,
    findIDKey,
    getChildNode,
    getNode,
    getNodeValue,
    globalState,
    isObservable,
    isHintOpaque,
    isHintPlain,
    optimized,
    setNodeValue,
    symbolDelete,
    symbolGetNode,
    symbolIterator,
    symbolLinked,
    symbolToPrimitive,
    getKeys,
} from './globals';
import {
    hasOwnProperty,
    isArray,
    isBoolean,
    isChildNode,
    isEmpty,
    isFunction,
    isMap,
    isNullOrUndefined,
    isObject,
    isPrimitive,
    isPromise,
    isSet,
} from './is';
import { linked } from './linked';
import type {
    Change,
    ChildNodeInfo,
    GetOptions,
    LinkedOptions,
    ListenerParams,
    NodeInfo,
    ObservableState,
    TrackingType,
    UpdateFn,
} from './observableInterfaces';
import { Observable } from './observableTypes';
import { observe } from './observe';
import { onChange } from './onChange';
import { updateTracking } from './tracking';
import { whenReady } from './when';

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
const ArrayLoopers = new Set<keyof Array<any>>([
    'every',
    'filter',
    'find',
    'findIndex',
    'flatMap',
    'forEach',
    'join',
    'map',
    'reduce',
    'some',
]);
const ArrayLoopersReturn = new Set<keyof Array<any>>(['filter', 'find']);
export const observableProperties = new Map<
    string,
    { get: (node: NodeInfo, ...args: any[]) => any; set: (node: NodeInfo, value: any) => any }
>();
export const observableFns = new Map<string, (node: NodeInfo, ...args: any[]) => any>([
    ['get', get],
    ['set', set],
    ['peek', peek],
    ['onChange', onChange],
    ['assign', assign],
    ['delete', deleteFn],
    ['toggle', toggle],
]);

if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // eslint-disable-next-line no-var
    var __devUpdateNodes = new Set();
}
function collectionSetter(node: NodeInfo, target: any[], prop: keyof Array<any>, ...args: any[]) {
    if (prop === 'push' && args.length === 1) {
        // Fast path for push to just append to the end
        setKey(node, target.length + '', args[0]);
    } else {
        const prevValue = target.slice();

        const ret = (target[prop] as Function).apply(target, args);

        if (node) {
            const hasParent = isChildNode(node);
            const key: string = hasParent ? node.key : '_';
            const parentValue = hasParent ? getNodeValue(node.parent) : node.root;

            // Set the object to the previous value first
            parentValue[key] = prevValue;

            // Then set with the new value so it notifies with the correct prevValue
            setKey(node.parent ?? node, key, target);
        }

        // Return the original value
        return ret;
    }
}

function updateNodes(parent: NodeInfo, obj: Record<any, any> | Array<any> | undefined, prevValue: any): boolean {
    if (
        (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
        typeof __devUpdateNodes !== 'undefined' &&
        isObject(obj)
    ) {
        if (__devUpdateNodes.has(obj)) {
            console.error(
                '[legend-state] Circular reference detected in object. You may want to use opaqueObject to stop traversing child nodes.',
                obj,
            );
            return false;
        }
        __devUpdateNodes.add(obj);
    }
    if ((isObject(obj) && isHintOpaque(obj)) || (isObject(prevValue) && isHintOpaque(prevValue))) {
        const isDiff = obj !== prevValue;
        if (isDiff) {
            if (parent.listeners || parent.listenersImmediate) {
                notify(parent, obj, prevValue, 0);
            }
        }
        if (
            (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
            typeof __devUpdateNodes !== 'undefined' &&
            obj !== undefined
        ) {
            __devUpdateNodes.delete(obj);
        }
        return isDiff;
    }

    const isArr = isArray(obj);

    let prevChildrenById: Map<string, ChildNodeInfo> | undefined;
    let moved: [string, ChildNodeInfo][] | undefined;

    const isCurMap = isMap(obj);
    const isCurSet = isSet(obj);
    const isPrevMap = isMap(prevValue);
    const isPrevSet = isSet(prevValue);

    const keys = getKeys(obj, isArr, isCurMap, isCurSet);
    const keysPrev = getKeys(prevValue, isArr, isPrevMap, isPrevSet);
    const length = (keys || obj)?.length || 0;
    const lengthPrev = (keysPrev || prevValue)?.length || 0;

    let idField: string | ((value: any) => string) | undefined;
    let isIdFieldFunction;
    let hasADiff = false;
    let retValue: boolean | undefined;

    if (isArr && isArray(prevValue)) {
        // Construct a map of previous indices for computing move
        if (prevValue.length > 0) {
            const firstPrevValue = prevValue[0];
            if (firstPrevValue !== undefined) {
                idField = findIDKey(firstPrevValue, parent);

                if (idField) {
                    isIdFieldFunction = isFunction(idField);
                    prevChildrenById = new Map();
                    moved = [];
                }

                const keysSeen: Set<string> =
                    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
                        ? new Set()
                        : (undefined as unknown as Set<string>);
                if (parent.children) {
                    for (let i = 0; i < prevValue.length; i++) {
                        const p = prevValue[i];
                        if (p) {
                            const child = parent.children.get(i + '');
                            if (child) {
                                if (!obj[i]) {
                                    // If the previous value is not in the new array and it
                                    // is an activated, disable its listeners
                                    handleDeletedChild(child, p);
                                }

                                if (idField) {
                                    const key = isIdFieldFunction
                                        ? (idField as (value: any) => string)(p)
                                        : p[idField as string];

                                    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                                        if (keysSeen.has(key)) {
                                            console.warn(
                                                `[legend-state] Warning: Multiple elements in array have the same ID. Key field: ${idField}, Array:`,
                                                prevValue,
                                            );
                                        }
                                        keysSeen.add(key);
                                    }
                                    prevChildrenById!.set(key, child);
                                }
                            }
                        }
                    }
                }
            }
        }
    } else if (prevValue && (!obj || isObject(obj))) {
        // For keys that have been removed from object, notify and update children recursively
        const lengthPrev = keysPrev.length;
        for (let i = 0; i < lengthPrev; i++) {
            const key = keysPrev[i];
            if (!keys.includes(key)) {
                hasADiff = true;
                const child = getChildNode(parent, key);

                const prev = isPrevMap ? prevValue.get(key) : prevValue[key];
                if (prev !== undefined) {
                    handleDeletedChild(child, prev);
                }
            }
        }
    }

    if (obj && !isPrimitive(obj)) {
        hasADiff = hasADiff || length !== lengthPrev;
        const isArrDiff = hasADiff;
        let didMove = false;

        for (let i = 0; i < length; i++) {
            const key = isArr ? i + '' : keys[i];
            let value = isCurMap ? obj.get(key) : (obj as any)[key];
            const prev = isPrevMap ? prevValue?.get(key) : prevValue?.[key];

            let isDiff = !equals(value, prev);
            if (isDiff) {
                const id =
                    idField && value
                        ? isIdFieldFunction
                            ? (idField as (value: any) => string)(value)
                            : value[idField as string]
                        : undefined;

                const existingChild = parent.children?.get(key);

                if (isObservable(value)) {
                    const valueNode = getNode(value);
                    if (existingChild?.linkedToNode === valueNode) {
                        const targetValue = getNodeValue(valueNode);
                        isCurMap ? obj.set(key, targetValue) : ((obj as any)[key] = targetValue);
                        continue;
                    }
                    const obs = value;
                    value = () => obs;
                }
                let child = getChildNode(parent, key, value);

                if (!child.lazy && (isFunction(value) || isObservable(value))) {
                    reactivateNode(child, value);
                    peekInternal(child);
                }

                // Detect moves within an array. Need to move the original proxy to the new position to keep
                // the proxy stable, so that listeners to this node will be unaffected by the array shift.
                if (isArr && id !== undefined) {
                    // Find the previous position of this element in the array
                    const prevChild = id !== undefined ? prevChildrenById?.get(id) : undefined;
                    if (!prevChild) {
                        // This id was not in the array before so it does not need to notify children
                        // It does need to notify itself so isDiff should remain.
                        hasADiff = true;
                    } else if (prevChild !== undefined && prevChild.key !== key) {
                        const valuePrevChild = prevValue[prevChild.key];
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
                        isDiff = valuePrevChild !== value;
                    }
                }

                if (isDiff) {
                    // Array has a new / modified element
                    // If object iterate through its children
                    if (isFunction(value) || isObservable(value)) {
                        extractFunctionOrComputed(parent, key, value);
                    } else if (isPrimitive(value)) {
                        hasADiff = true;
                    } else {
                        // Always need to updateNodes so we notify through all children
                        const updatedNodes = updateNodes(child, value, prev);
                        hasADiff = hasADiff || updatedNodes;
                        isDiff = updatedNodes;
                    }
                }
                if (isDiff || (isArr && !isArrDiff)) {
                    // Notify for this child if this element is different and it has listeners
                    // Or if the position changed in an array whose length did not change
                    // But do not notify child if the parent is an array with changing length -
                    // the array's listener will cover it
                    if (child.listeners || child.listenersImmediate) {
                        notify(child, value, prev, 0, !isArrDiff);
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
        retValue = hasADiff || didMove;
    } else if (prevValue !== undefined) {
        // If value got set to undefined, it has a diff
        retValue = true;
    }

    if (
        (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
        typeof __devUpdateNodes !== 'undefined' &&
        obj !== undefined
    ) {
        __devUpdateNodes.delete(obj);
    }
    return retValue ?? false;
}

function handleDeletedChild(child: NodeInfo, p: any) {
    // If the previous value is not in the new array and it
    // is an activated, disable its listeners
    child.linkedToNodeDispose?.();
    child.activatedObserveDispose?.();

    if (!isPrimitive(p)) {
        updateNodes(child, undefined, p);
    }

    if (child.listeners || child.listenersImmediate) {
        notify(child, undefined, p, 0);
    }
}

export function getProxy(node: NodeInfo, p?: string, asFunction?: Function): Observable {
    // Get the child node if p prop
    if (p !== undefined) node = getChildNode(node, p, asFunction);

    // Create a proxy if not already cached and return it
    return (node.proxy || (node.proxy = new Proxy<NodeInfo>(node, proxyHandler))) as Observable<any>;
}

export function flushPending() {
    // Need to short circuit the computed batching because the user called get() or peek()
    // in which case the set needs to run immediately so that the values are up to date.
    if (globalState.pendingNodes.size > 0) {
        const nodes = Array.from(globalState.pendingNodes.values());
        globalState.pendingNodes.clear();
        nodes.forEach((fn) => fn());
    }
}

const proxyHandler: ProxyHandler<any> = {
    get(node: NodeInfo, p: any, receiver: any) {
        if (p === symbolToPrimitive) {
            throw new Error(
                process.env.NODE_ENV === 'development'
                    ? '[legend-state] observable should not be used as a primitive. You may have forgotten to use .get() or .peek() to get the value of the observable.'
                    : '[legend-state] observable is not a primitive.',
            );
        }
        if (p === symbolGetNode) {
            return node;
        }

        if (p === 'apply' || p === 'call') {
            const nodeValue = getNodeValue(node);
            if (isFunction(nodeValue)) {
                return nodeValue[p];
            }
        }

        let value = peekInternal(node, /*activateRecursive*/ p === 'get' || p === 'peek');

        // Trying to get an iterator if the raw value is a primitive should return undefined.
        // React dev validation does this for example, and crashes if it gets an actual iterator.
        if (p === symbolIterator) {
            return !value || isPrimitive(value) ? undefined : value[p];
        }

        // If this node is linked to another observable then forward to the target's handler.
        // The exception is onChange because it needs to listen to this node for changes.
        // This needs to be below peek because it activates there.
        const targetNode = node.linkedToNode || value?.[symbolGetNode];
        if (targetNode && p !== 'onChange') {
            return proxyHandler.get!(targetNode, p, receiver);
        }

        if (isMap(value) || isSet(value)) {
            const ret = handlerMapSet(node, p, value);
            if (ret !== undefined) {
                return ret;
            }
        }

        const fn = observableFns.get(p);
        // If this is an observable function, call it
        if (fn) {
            if (p === 'get' || p === 'peek') {
                flushPending();
            }
            return function (a: any, b: any, c: any) {
                const l = arguments.length;

                // Array call and apply are slow so micro-optimize this hot path.
                // The observable functions depends on the number of arguments so we have to
                // call it with the correct arguments, not just undefined
                switch (l) {
                    case 0:
                        return fn(node);
                    case 1:
                        return fn(node, a);
                    case 2:
                        return fn(node, a, b);
                    default:
                        return fn(node, a, b, c);
                }
            };
        }

        // If this is an observable property that has been added by config functions, return it
        const property = observableProperties.get(p);
        if (property) {
            return property.get(node);
        }

        // Get raw value of the property
        let vProp = value?.[p];

        // If it's an opaque object, can skip the rest of the logic
        if (isObject(value) && isHintOpaque(value)) {
            return vProp;
        }

        const fnOrComputed = node.functions?.get(p);
        if (fnOrComputed) {
            if (isObservable(fnOrComputed)) {
                // If it's a linked observable, return the target
                return fnOrComputed;
            } else {
                // Otherwise return a proxy to the function
                return getProxy(node, p, fnOrComputed as Function);
            }
        } else {
            // Check if this is a property that has been added by defineProperty
            vProp = checkProperty(value, p);
        }

        if (isNullOrUndefined(value) && vProp === undefined && (ArrayModifiers.has(p) || ArrayLoopers.has(p))) {
            value = [];
            setNodeValue(node, value);
            vProp = value[p];
        }

        // Handle function calls
        if (isFunction(vProp)) {
            if (isArray(value)) {
                if (ArrayModifiers.has(p)) {
                    // Call the wrapped modifier function
                    return (...args: any[]) => collectionSetter(node, value, p, ...args);
                } else if (ArrayLoopers.has(p)) {
                    // Update that this node was accessed for observers
                    updateTracking(node, true);

                    return function (cbOrig: any, thisArg: any) {
                        const isReduce = p === 'reduce';
                        // Callbacks are given the Proxy rather than the underlying data
                        const cbWrapped = isReduce
                            ? (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => {
                                  return cbOrig(
                                      previousValue,
                                      getProxy(node, currentIndex + '', currentValue),
                                      currentIndex,
                                      array,
                                  );
                              }
                            : (val: any, index: number, array: any[]) => {
                                  return cbOrig(getProxy(node, index + '', val), index, array);
                              };

                        if (isReduce || !ArrayLoopersReturn.has(p)) {
                            return value[p](cbWrapped, thisArg);
                        }

                        const isFind = p === 'find';
                        const out = [];
                        for (let i = 0; i < value.length; i++) {
                            type LooperType = Parameters<typeof Array.prototype.map>[0];
                            if ((cbWrapped as LooperType)(value[i], i, value)) {
                                const proxy = getProxy(node, i + '');
                                // find returns the first match, otherwise it returns an array
                                if (isFind) {
                                    return proxy;
                                }
                                out.push(proxy);
                            }
                        }
                        return isFind ? undefined : out;
                    };
                }
            }

            extractFunctionOrComputed(node, p, vProp);

            const fnOrComputed2 = node.functions?.get(p);
            if (fnOrComputed2) {
                return getProxy(node, p, fnOrComputed2 as Function);
            }

            // Return the function bound to the value
            return vProp.bind(value);
        }

        // Accessing primitive returns the raw value
        if (isPrimitive(vProp)) {
            // Update that this primitive node was accessed for observers
            if (p === 'length' && isArray(value)) {
                updateTracking(node, true);
                return vProp;
            }
        }

        // Return an observable proxy to the property
        return getProxy(node, p);
    },
    // Forward all proxy properties to the target's value
    getPrototypeOf(node: NodeInfo) {
        const value = getNodeValue(node);
        return value !== null && typeof value === 'object' ? Reflect.getPrototypeOf(value) : null;
    },
    ownKeys(node: NodeInfo) {
        // TODO: Temporary workaround to fix a bug - the first peek may not return the correct value
        // if the value is a cached. This fixes the test "cache with initial ownKeys"
        peekInternal(node);

        const value = get(node, true);
        if (isPrimitive(value)) return [];

        const keys = value ? Reflect.ownKeys(value) : [];

        // This is required to fix this error:
        // TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported non-configurability for
        // property 'length' which is either non-existent or configurable in the proxy node
        if (isArray(value) && keys[keys.length - 1] === 'length') {
            keys.splice(keys.length - 1, 1);
        }
        if (isFunction(node)) {
            const reflectedKeys = Reflect.ownKeys(node);
            ['caller', 'arguments', 'prototype'].forEach((key) => reflectedKeys.includes(key) && keys.push(key));
        }
        return keys;
    },
    getOwnPropertyDescriptor(node: NodeInfo, prop: string) {
        if (prop === 'caller' || prop === 'arguments' || prop === 'prototype') {
            return { configurable: false, enumerable: false };
        }
        const value = getNodeValue(node);
        return isPrimitive(value) ? undefined : Reflect.getOwnPropertyDescriptor(value, prop);
    },
    set(node: NodeInfo, prop: string, value: any) {
        // If this assignment comes from within an observable function it's allowed
        if (node.isSetting) {
            return Reflect.set(node, prop, value);
        }
        if (node.isAssigning) {
            setKey(node, prop, value);
            return true;
        }

        const property = observableProperties.get(prop);
        if (property) {
            property.set(node, value);
            return true;
        }

        if (process.env.NODE_ENV === 'development') {
            console.warn('[legend-state]: Error: Cannot set a value directly:', prop, value);
        }
        return false;
    },
    deleteProperty(node: NodeInfo, prop: string) {
        // If this delete comes from within an observable function it's allowed
        if (node.isSetting) {
            return Reflect.deleteProperty(node, prop);
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.warn('[legend-state]: Error: Cannot delete a value directly:', prop);
            }
            return false;
        }
    },
    has(node: NodeInfo, prop: string) {
        const value = getNodeValue(node);
        return Reflect.has(value, prop);
    },
    apply(target, thisArg, argArray) {
        // If it's a function call it as a function
        if (isObservable(thisArg)) {
            thisArg = thisArg.peek();
        }
        // Get the raw value of the function
        const fnRaw = getNodeValue(target);
        // Use the function if still defined as a function, or the saved lazyFn if it's been extracted as an observable
        const fn = isFunction(fnRaw) ? fnRaw : target.lazyFn || target;
        // Apply the function
        return Reflect.apply(fn, thisArg, argArray);
    },
};

export function set(node: NodeInfo, newValue?: any) {
    if (node.parent) {
        setKey(node.parent, node.key, newValue);
    } else {
        setKey(node, '_', newValue);
    }
}
function toggle(node: NodeInfo) {
    const value = getNodeValue(node);
    if (value === undefined || value === null || isBoolean(value)) {
        set(node, !value);
    } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        throw new Error('[legend-state] Cannot toggle a non-boolean value');
    }
}

function setKey(node: NodeInfo, key: string, newValue?: any, level?: number) {
    if (process.env.NODE_ENV === 'development') {
        if (typeof HTMLElement !== 'undefined' && newValue instanceof HTMLElement) {
            console.warn(`[legend-state] Set an HTMLElement into state. You probably don't want to do that.`);
        }
    }

    const isRoot = !node.parent && key === '_';

    if (node.parent && !getNodeValue(node) && !isFunction(newValue)) {
        set(node, { [key]: newValue });
    }

    // Get the child node for updating and notifying
    const childNode: NodeInfo = isRoot ? node : getChildNode(node, key, newValue);

    if (isObservable(newValue)) {
        setToObservable(childNode, newValue);
    } else {
        // Set the raw value on the parent object
        const { newValue: savedValue, prevValue, parentValue } = setNodeValue(childNode, newValue);

        const isPrim = isPrimitive(savedValue) || savedValue instanceof Date;

        if (!isPrim) {
            let parent = childNode;
            do {
                parent.needsExtract = true;
                parent.recursivelyAutoActivated = false;
            } while ((parent = parent.parent!));
        }

        const notify = !equals(savedValue, prevValue);
        const forceNotify = !notify && childNode.isComputing && !isPrim;

        if (notify || forceNotify) {
            updateNodesAndNotify(
                node,
                savedValue,
                prevValue,
                childNode,
                parentValue,
                isPrim,
                isRoot,
                level,
                forceNotify,
            );
        }

        extractFunctionOrComputed(node, key, savedValue);
    }
}

function assign(node: NodeInfo, value: any) {
    const proxy = getProxy(node);

    beginBatch();

    if (isPrimitive(node.root._)) {
        node.root._ = {};
    }

    if (isMap(value)) {
        const currentValue = getNodeValue(node);
        if (isMap(currentValue)) {
            value.forEach((value, key) => currentValue.set(key, value));
        } else {
            set(node, value);
        }
    } else {
        // Set inAssign to allow setting on safe observables
        node.isAssigning = (node.isAssigning || 0) + 1;
        try {
            // TODO: If current value is a Map how to assign into the Map?
            Object.assign(proxy, value);
        } finally {
            node.isAssigning--;
        }
    }

    endBatch();

    return proxy;
}

function deleteFn(node: NodeInfo, key?: string) {
    // If called without a key, delete by key from the parent node
    if (key === undefined && isChildNode(node)) {
        key = node.key;
        node = node.parent;
    }
    const value = getNodeValue(node);
    if (isArray(value)) {
        collectionSetter(node, value, 'splice', key!, 1);
    } else {
        setKey(node, key ?? '_', symbolDelete, /*level*/ -1);
    }
}

function handlerMapSet(node: NodeInfo, p: any, value: Map<any, any> | WeakMap<any, any> | Set<any> | WeakSet<any>) {
    const vProp = (value as any)?.[p];
    if (p === 'size') {
        updateTracking(node, true);
        return (value as any)[p];
    } else if (isFunction(vProp)) {
        return function (a: any, b: any, c: any) {
            const l = arguments.length;
            const valueMap = value as Map<any, any>;

            if (p === 'get') {
                if (l > 0 && typeof a !== 'boolean' && a !== optimized) {
                    return getProxy(node, a);
                }
            } else if (p === 'set') {
                if (l === 2) {
                    set(getChildNode(node, a), b);
                } else if (l === 1 && isMap(value)) {
                    set(node, a);
                }
                return getProxy(node);
            } else if (p === 'delete') {
                if (l > 0) {
                    // Support Set by just returning a if it doesn't have get, meaning it's not a Map
                    const prev = (value as Map<any, any>).get ? valueMap.get(a) : a;
                    deleteFn(node, a);

                    // Return whether it was deleted
                    return prev !== undefined;
                }
            } else if (p === 'clear') {
                const prev = new Map(valueMap);
                const size = valueMap.size;
                valueMap.clear();
                if (size) {
                    updateNodesAndNotify(node, value, prev);
                }
                return;
            } else if (p === 'add') {
                const prev = new Set(value as unknown as Set<any>);
                const ret = (value as unknown as Set<any>).add(a);
                if (!(value as unknown as Set<any>).has(p)) {
                    notify(node, ret, prev, 0);
                }
                return getProxy(node);
            }

            // TODO: This is duplicated from proxy handler, how to dedupe with best performance?
            const fn = observableFns.get(p);
            if (fn) {
                // Array call and apply are slow so micro-optimize this hot path.
                // The observable functions depends on the number of arguments so we have to
                // call it with the correct arguments, not just undefined
                switch (l) {
                    case 0:
                        return fn(node);
                    case 1:
                        return fn(node, a);
                    case 2:
                        return fn(node, a, b);
                    default:
                        return fn(node, a, b, c);
                }
            } else {
                return (value as any)[p](a, b);
            }
        };
    }
}

function updateNodesAndNotify(
    node: NodeInfo,
    newValue: any,
    prevValue: any,
    childNode?: NodeInfo,
    parentValue?: any,
    isPrim?: boolean,
    isRoot?: boolean,
    level?: number,
    forceNotify?: boolean,
) {
    if (!childNode) childNode = node;
    // Make sure we don't call too many listeners for every property set
    beginBatch();

    if (isPrim === undefined) {
        isPrim = isPrimitive(newValue);
    }

    let hasADiff = forceNotify || isPrim;
    let whenOptimizedOnlyIf = false;
    let valueAsArr: any[] | undefined;
    let valueAsMap: Map<any, any> | undefined;
    // If new value is an object or array update notify down the tree
    if (!isPrim || (prevValue && !isPrimitive(prevValue))) {
        if (
            (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
            typeof __devUpdateNodes !== 'undefined'
        ) {
            __devUpdateNodes.clear();
        }
        hasADiff = hasADiff || updateNodes(childNode, newValue, prevValue);

        // Check if value is an array, Map, or Set so we can optimize the notification
        if (isArray(newValue)) {
            valueAsArr = newValue as any[];
        } else if (isMap(newValue) || isSet(newValue)) {
            valueAsMap = newValue as Map<any, any>;
        }
    }

    // Check if parent value is an array, Map, or Set so we can optimize the notification
    if (isArray(parentValue)) {
        valueAsArr = parentValue as any[];
    } else if (isMap(parentValue) || isSet(parentValue)) {
        valueAsMap = parentValue as Map<any, any>;
    }

    // If value is an array, Map, or Set and the size has changed it should notify optimized listeners
    if (valueAsArr) {
        whenOptimizedOnlyIf = valueAsArr?.length !== prevValue?.length;
    } else if (valueAsMap) {
        whenOptimizedOnlyIf = valueAsMap?.size !== prevValue?.size;
    }

    if (isPrim || !newValue || (isEmpty(newValue) && !isEmpty(prevValue)) ? newValue !== prevValue : hasADiff) {
        // Notify for this element if something inside it has changed
        notify(
            isPrim && isRoot ? node : childNode,
            newValue,
            prevValue,
            (level ?? prevValue === undefined) ? -1 : hasADiff ? 0 : 1,
            whenOptimizedOnlyIf,
        );
    }

    endBatch();
}

export function extractPromise(node: NodeInfo, value: Promise<any>, setter?: (params: { value: any }) => void) {
    const numGets = (node.numGets = (node.numGets || 0) + 1);

    if (!node.state) {
        node.state = createObservable<ObservableState>(
            {
                isLoaded: false,
            } as ObservableState,
            false,
            extractPromise,
            getProxy,
        ) as any;
    }

    value
        .then((value) => {
            // If this is from an older Promise than one that resolved already,
            // ignore it as the newer one wins
            if (numGets >= (node.getNumResolved || 0)) {
                node.getNumResolved = node.numGets;
                setter ? setter({ value }) : set(node, value);
                node.state!.assign({
                    isLoaded: true,
                    error: undefined,
                });
            }
        })
        .catch((error) => {
            node.state!.error.set(error);
        });
}

function extractFunctionOrComputed(node: NodeInfo, k: string, v: any) {
    // We want to extract these types of values from the observable's raw value so that
    // the raw value does not contain Promises, Observables or functions
    if (isPromise(v)) {
        const childNode = getChildNode(node, k);
        extractPromise(childNode, v);
        setNodeValue(childNode, undefined);
        return undefined;
    } else if (isObservable(v)) {
        const fn = () => v;
        extractFunction(node, k, fn);
        const childNode = getChildNode(node, k, fn);
        const targetNode = getNode(v);
        // Set node to target's value if activating or it's already activated
        const initialValue = peek(targetNode);
        setToObservable(childNode, v);
        setNodeValue(childNode, initialValue);
        return getNodeValue(childNode);
    } else if (typeof v === 'function') {
        extractFunction(node, k, v);
        return k;
    }
}

export function get(node: NodeInfo, options?: TrackingType | GetOptions) {
    const track = options ? (isObject(options) ? (options.shallow as TrackingType) : options) : undefined;
    // Track by default
    updateTracking(node, track);

    return peek(node);
}

export function peek(node: NodeInfo) {
    return peekInternal(node, true);
}

let isFlushing = false;

export function peekInternal(node: NodeInfo, activateRecursive?: boolean) {
    isFlushing = true;
    // Need to refresh all dirty children when getting
    if (activateRecursive && node.dirtyChildren?.size) {
        const dirty = Array.from(node.dirtyChildren);
        node.dirtyChildren.clear();
        dirty.forEach((node) => node.dirtyFn && peekInternal(node));
    }
    if (node.dirtyFn) {
        const dirtyFn = node.dirtyFn;
        node.dirtyFn = undefined;
        globalState.dirtyNodes.delete(node);
        dirtyFn();
    }

    isFlushing = false;

    let value = getNodeValue(node);

    if (node.parent?.isPlain || isHintPlain(value)) {
        node.isPlain = true;
    }

    // Don't want to check lazy while loading because we don't want to activate anything
    if (!node.root.isLoadingLocal && !node.isPlain) {
        value = checkLazy(node, value, !!activateRecursive);
    }

    return value;
}

function checkLazy(node: NodeInfo, value: any, activateRecursive: boolean) {
    const origValue = value;
    // If node is not yet lazily computed go do that
    const lazy = node.lazy;
    if (lazy) {
        const lazyFn = node.lazyFn!;
        delete node.lazy;
        if (isFunction(lazyFn)) {
            if (lazyFn.length === 1) {
                // This is a lookup function, so return a record object
                value = {};
            } else {
                if (node.parent) {
                    const parentValue = getNodeValue(node.parent);
                    if (isFunction(value)) {
                        if (parentValue) {
                            delete parentValue[node.key];
                        } else {
                            node.root._ = undefined;
                        }
                    }
                }

                value = activateNodeFunction(node as any, lazyFn);
            }
        } else if (isObservable(value)) {
            value = extractFunctionOrComputed(node.parent!, node.key!, value);
        }
    }

    if ((lazy || node.needsExtract) && !isObservable(value) && !isPrimitive(value)) {
        // If this is a purposeful get, check descendants for observable or auto activated linked
        if (activateRecursive) {
            recursivelyAutoActivate(value, node);
        }
        // If this is an extractable node, extract it from parent before it's accessed
        if (node.parent) {
            extractFunctionOrComputed(node.parent!, node.key!, origValue);
        }
    }

    return value;
}

function checkProperty(value: any, key: string) {
    if (value) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (property?.get) {
            delete value[key];
            value[key] = property.set
                ? linked({
                      get: property.get,
                      set: ({ value }) => property.set!(value),
                  })
                : property.get;
        }
        return value[key];
    }
}

function reactivateNode(node: NodeInfo, lazyFn: Function) {
    node.activatedObserveDispose?.();
    node.linkedToNodeDispose?.();
    node.activatedObserveDispose = node.linkedToNodeDispose = node.linkedToNode = undefined;
    node.lazyFn = lazyFn;
    node.lazy = true;
}

export function isObserved(node: NodeInfo) {
    let parent = node;
    let hasListeners = node.numListenersRecursive > 0;
    while (parent && !hasListeners) {
        if (!!parent.listeners?.size || !!parent.listenersImmediate?.size) {
            hasListeners = true;
        }
        parent = parent.parent!;
    }
    return hasListeners;
}

export function shouldIgnoreUnobserved(node: NodeInfo, refreshFn: () => void) {
    if (!isFlushing) {
        const hasListeners = isObserved(node);
        if (!hasListeners) {
            if (refreshFn) {
                node.dirtyFn = refreshFn;
            }
            let parent = node;
            while (parent) {
                if (!parent.dirtyChildren) {
                    parent.dirtyChildren = new Set();
                }
                parent.dirtyChildren.add(node);

                parent = parent.parent!;
            }
            return true;
        }
    }
}

function activateNodeFunction(node: NodeInfo, lazyFn: Function) {
    // let prevTarget$: Observable<any>;
    // let curTarget$: Observable<any>;
    let update: UpdateFn;
    let wasPromise: boolean | undefined;
    let ignoreThisUpdate: boolean | undefined;
    let isFirst = true;
    const activateFn = lazyFn;
    let activatedValue;
    let disposes: (() => void)[] = [];
    let refreshFn: () => void;
    function markDirty() {
        node.dirtyFn = refreshFn;
        globalState.dirtyNodes.add(node);
    }

    node.activatedObserveDispose = observe(
        () => {
            // Set it to undefined so that the activation function gets undefined
            // if it peeks itself
            if (isFirst) {
                isFirst = false;
                if (isFunction(getNodeValue(node))) {
                    setNodeValue(node, undefined);
                }
            } else if (!isFlushing && refreshFn) {
                if (shouldIgnoreUnobserved(node, refreshFn)) {
                    ignoreThisUpdate = true;
                    return;
                }
            }
            // Run the function at this node
            let value = activateFn();

            let didSetToObs = false;
            // If target is an observable, make this node a link to it
            const isObs = isObservable(value);
            if (isObs || node.linkedToNode) {
                didSetToObs = isObs;
                value = setToObservable(node, value);
            }

            if (isFunction(value) && value.length === 0) {
                value = value();
            }
            const activated = !isObs ? (value?.[symbolLinked] as any) : undefined;
            if (activated) {
                node.activationState = activated;
                value = undefined;
            }
            ignoreThisUpdate = false;
            wasPromise = isPromise(value);

            // Activate this node if not activated already (may be called recursively)
            // TODO: Is calling recursively bad? If so can it be fixed?
            if (!node.activated) {
                node.activated = true;
                let activateNodeFn = activateNodeBase;
                // If this is a Synced then run it through persistence instead of base
                if (activated?.synced) {
                    activateNodeFn = globalState.activateSyncedNode;
                    ignoreThisUpdate = true;
                }

                const result = activateNodeFn(node, value);
                update = result.update;
                let newValue = result.value;
                if (!didSetToObs && isObservable(newValue)) {
                    newValue = setToObservable(node, newValue);
                }
                value = newValue ?? activated?.initial;
            } else if (node.activationState) {
                const activated = node.activationState! as LinkedOptions;
                if (node.state?.peek()?.sync) {
                    node.state.sync();
                    ignoreThisUpdate = true;
                } else {
                    value = activated.get?.() ?? activated.initial;
                }
            }
            // value is undefined if it's in a persisted retry
            wasPromise = wasPromise || isPromise(value);

            return value;
        },
        (e) => {
            const { value, nodes, refresh } = e;
            refreshFn = refresh;
            if (!ignoreThisUpdate) {
                if (!wasPromise || !globalState.isLoadingRemote) {
                    if (wasPromise) {
                        if (node.activationState) {
                            const { initial } = node.activationState!;

                            if (value && isPromise(value)) {
                                // Extract the promise to make it set the value/error when it comes in
                                extractPromise(node, value, update);
                            }
                            // Set this to undefined only if it's replacing the activation function,
                            // so we don't overwrite it if it already has real data from either local
                            // cache or a previous run
                            if (isFunction(getNodeValue(node))) {
                                setNodeValue(node, initial ?? undefined);
                            }
                        } else if (node.activated) {
                            // Extract the promise to make it set the value/error when it comes in
                            extractPromise(node, value, update);
                            // Set this to undefined only if it's replacing the activation function,
                            // so we don't overwrite it if it already has real data from either local
                            // cache or a previous run
                            if (isFunction(getNodeValue(node))) {
                                setNodeValue(node, undefined);
                            }
                        }
                    } else {
                        activatedValue = value;

                        const isLoaded = node.state!.isLoaded.peek();

                        // Need to set to make sure that listeners are notified, but some listeners ignore with isComputing
                        if (isLoaded || !isFunction(value)) {
                            node.isComputing = true;
                            set(node, value);
                            node.isComputing = false;
                        }

                        // If not already loaded set that it's loaded
                        if (!isLoaded) {
                            node.state!.assign({ isLoaded: true, error: undefined });
                        }
                    }
                }

                disposes.forEach((fn) => fn());
                disposes = [];
                nodes?.forEach(({ node, track }) => {
                    disposes.push(onChange(node, markDirty, { immediate: true, trackingType: track }));
                });
            }
            e.cancel = true;
        },
        { fromComputed: true },
    );
    return activatedValue;
}

function activateNodeBase(node: NodeInfo, value: any) {
    if (!node.state) {
        node.state = createObservable<ObservableState>(
            {
                isLoaded: false,
            } as ObservableState,
            false,
            extractPromise,
            getProxy,
        ) as any;
    }
    if (node.activationState) {
        const { set: setFn, get: getFn, initial } = node.activationState as LinkedOptions;

        value = getFn?.();

        if (value == undefined || value === null) {
            value = initial;
        }

        if (setFn) {
            let allChanges: Change[] = [];
            let latestValue: any = undefined;
            let runNumber = 0;
            const runChanges = (listenerParams?: ListenerParams) => {
                // Don't call the set if this is the first value coming in
                if (allChanges.length > 0) {
                    let changes: Change[];
                    let value: any;
                    let isFromPersist = false;
                    let isFromSync = false;
                    let getPrevious: () => any;
                    if (listenerParams) {
                        changes = listenerParams.changes;
                        value = listenerParams.value;
                        isFromPersist = listenerParams.isFromPersist;
                        isFromSync = listenerParams.isFromSync;
                        getPrevious = listenerParams.getPrevious;
                    } else {
                        // If this is called by flushPending then get the change array
                        // that we've been building up.
                        changes = allChanges;
                        value = latestValue;
                        getPrevious = createPreviousHandler(value, changes);
                    }
                    allChanges = [];
                    latestValue = undefined;
                    globalState.pendingNodes.delete(node);

                    runNumber++;
                    const thisRunNumber = runNumber;

                    const run = () => {
                        if (thisRunNumber !== runNumber) {
                            // set may get called multiple times before it loads so ignore any previous runs
                            return;
                        }

                        node.isComputing = true;
                        setFn({
                            value,
                            changes,
                            isFromPersist: isFromPersist,
                            isFromSync: isFromSync,
                            getPrevious,
                        });
                        node.isComputing = false;
                    };
                    whenReady(node.state!.isLoaded, run);
                }
            };

            const onChangeImmediate = ({ value, changes }: ListenerParams) => {
                if (!node.isComputing) {
                    if (changes.length > 1 || !isFunction(changes[0].prevAtPath)) {
                        latestValue = value;
                        if (allChanges.length > 0) {
                            changes = changes.filter((change) => !isArraySubset(allChanges[0].path, change.path));
                        }
                        allChanges.push(...changes);
                        globalState.pendingNodes.set(node, runChanges);
                    }
                }
            };

            // Create an immediate listener to mark this node as pending. Then actually run
            // the changes at the end of the batch so everything is properly batched.
            // However, this can be short circuited if the user calls get() or peek()
            // in which case the set needs to run immediately so that the values are up to date.
            onChange(node, onChangeImmediate as any, { immediate: true });
            onChange(node, runChanges);
        }
    }
    const update: UpdateFn = ({ value }) => {
        if (!node.isComputing) {
            node.isComputing = true;
            set(node, value);
            node.isComputing = false;
        }
    };
    return { update, value };
}

function setToObservable(node: NodeInfo, value: any) {
    // If the computed is a proxy to another observable
    // link it to the target observable
    const linkedNode = value ? getNode(value) : undefined;
    if (linkedNode !== node && linkedNode?.linkedToNode !== node) {
        node.linkedToNode = linkedNode;
        node.linkedToNodeDispose?.();

        if (linkedNode) {
            linkedNode.linkedFromNodes ||= new Set();
            linkedNode.linkedFromNodes.add(node);
            node.linkedToNodeDispose = onChange(
                linkedNode,
                () => {
                    value = peekInternal(linkedNode);
                    if (!isFunction(value)) {
                        set(node, value);
                    }
                },
                { initial: true },
                new Set([node]),
            );
        }
    }
    return value;
}

function recursivelyAutoActivate(obj: Record<string, any>, node: NodeInfo) {
    if (!node.recursivelyAutoActivated && (isObject(obj) || isArray(obj)) && !isHintOpaque(obj)) {
        node.recursivelyAutoActivated = true;
        const pathStack: string[] = []; // Maintain a stack for path tracking
        const getNodeAtPath = () => {
            let childNode = node;
            for (let i = 0; i < pathStack.length; i++) {
                const key = pathStack[i];
                const value = getNodeValue(childNode)?.[key];
                childNode = getChildNode(childNode, key, isFunction(value) ? value : undefined);
                peekInternal(childNode);
            }

            return childNode;
        };
        recursivelyAutoActivateInner(obj, pathStack, getNodeAtPath);
    }
}

function recursivelyAutoActivateInner(obj: Record<string, any>, pathStack: string[], getNodeAtPath: () => NodeInfo) {
    if ((isObject(obj) || isArray(obj)) && !isHintOpaque(obj) && !isHintPlain(obj)) {
        for (const key in obj) {
            if (hasOwnProperty.call(obj, key)) {
                const value = obj[key];

                if (isObservable(value)) {
                    const childNode = getNodeAtPath();
                    extractFunctionOrComputed(childNode, key, value);
                    delete childNode.lazy;
                } else {
                    const linkedOptions: LinkedOptions = isFunction(value) && value.prototype?.[symbolLinked];
                    if (linkedOptions) {
                        const activate = linkedOptions.activate;
                        if (!activate || activate === 'auto') {
                            const childNode = getNodeAtPath();
                            peek(getChildNode(childNode, key, value));
                        }
                    }
                }

                if (typeof value === 'object') {
                    pathStack.push(key);
                    recursivelyAutoActivateInner(value, pathStack, getNodeAtPath); // Recursively traverse
                    pathStack.pop();
                }
            }
        }
    }
}
