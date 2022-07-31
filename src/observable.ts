import {
    arrPaths,
    delim,
    getNodeValue,
    getObjectNode,
    getParentNode,
    getPathNode,
    getValueAtPath,
    hasPathNode,
    symbolID,
    symbolProp,
} from './globals';
import { isArray, isObject, isPrimitive } from './is';
import { observableBatcher, observableBatcherNotify } from './observableBatcher';
import {
    Observable,
    ObservableListenerInfo,
    ObservablePrimitive,
    ObservableWrapper,
    PathNode,
} from './observableInterfaces';
import { onChange, onChangeShallow, onEquals, onHasValue, onTrue } from './on';

let nextID = 0;

// Prepare an array of all the functions
const objectFns: [string, Function][] = [
    ['set', set],
    ['onChange', onChange],
    ['onChangeShallow', onChangeShallow],
    ['onEquals', onEquals],
    ['onHasValue', onHasValue],
    ['onTrue', onTrue],
    ['prop', prop],
    ['assign', assign],
    ['delete', deleteFn],
];

// Wrap the observable functions while converting from object to PathNode
for (let i = 0; i < objectFns.length; i++) {
    const fn = objectFns[i][1];
    objectFns[i][1] = function (a, b, c) {
        let node: PathNode;
        const prop = this[symbolProp];
        let num = arguments.length;
        if (prop) {
            node = prop.node;
            c = b;
            b = a;
            a = prop.key;
            num++;
        } else {
            node = getObjectNode(this);
        }
        if (node) {
            // Micro-optimize here because it's the core path and this is faster than apply
            return num === 3 ? fn(node, a, b, c) : num === 2 ? fn(node, a, b) : num === 1 ? fn(node, a) : fn(node);
        } else {
            console.error('Node not found, unable to call function on observable');
        }
    };
}

const descriptorsArray: PropertyDescriptorMap = {};

// Override array functions to call set
['copyWithin', 'fill', 'from', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'].forEach((key) => {
    descriptorsArray[key] = {
        value() {
            const prevValue = this.slice();
            // Call the original function
            const ret = Array.prototype[key].apply(this, arguments);

            const node = getObjectNode(this);
            if (node) {
                const parentNode = getParentNode(node);
                if (parentNode) {
                    const parent = getNodeValue(parentNode);

                    // Set the object to the previous value first
                    parent[node.key] = prevValue;

                    // Then set with the new value so it notifies with the correct prevValue
                    set(node, this);
                }
            }

            // Return the original value
            return ret;
        },
    };
});

function createUnderscore(obj: any, node: PathNode): PropertyDescriptor {
    const id = nextID++;
    // Add this to arrPaths so we can track its node later
    arrPaths[id] = node;

    // Create the _ object
    const out = {
        [symbolID]: id,
    };

    // Bind all the _ functions to it
    for (let i = 0; i < objectFns.length; i++) {
        const [key, fn] = objectFns[i];
        out[key] = fn.bind(obj);
    }

    // Don't want this property to be user modifiable
    return {
        enumerable: false,
        configurable: false,
        writable: false,
        value: out,
    };
}

function updateNodes(parent: PathNode, obj: Record<any, any>, prevValue?: any) {
    const isArr = isArray(obj);
    // If array it's faster to just use the array
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;

    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        const isObj = !isPrimitive(obj[key]);
        // Notify for this child if this element is different and it has a PathNode already
        // But do not notify child if the parent is an array - the array's listener will cover it
        const doNotify =
            !isArr && prevValue && obj[key] !== prevValue[key] && hasPathNode(parent.root, parent.path, key);
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

    // Define the _ property on this element, and override the array properties if it's an array
    const hasDefined = obj._;
    if (!hasDefined) {
        Object.defineProperty(obj, '_', createUnderscore(obj, parent));
        if (isArray(obj)) {
            Object.defineProperties(obj, descriptorsArray);
        }
    }
}

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
        const id = (prevValue as { _: any })._?.[symbolID];
        delete arrPaths[id];
    }
}

function set(node: PathNode, newValue: any): any;
function set(node: PathNode, key: string, newValue: any): any;
function set(node: PathNode, key: string, newValue?: any): any {
    if (arguments.length < 3) {
        if (node.path.includes(delim)) {
            // If this was called without a key pass it up to parent with the key
            return set(getParentNode(node), node.key, key);
        } else {
            // Set on the root has to assign
            return assign(node, key);
        }
    } else {
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
    }

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

        const parentListenerInfo = Object.assign({}, listenerInfo);
        parentListenerInfo.path = [node.key].concat(listenerInfo.path);
        _notifyParents(parent, parentListenerInfo, level + 1);
    }
}
function notify(node: PathNode, value: any, prevValue: any, level: number) {
    // Create the listenerInfo
    const listenerInfo = { path: [], prevValue, value };
    // Start notifying up through parents with the listenerInfo
    _notifyParents(node, listenerInfo, level);
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

function deleteFn(node: PathNode, key?: string) {
    if (arguments.length < 2) {
        return deleteFn(getParentNode(node), node.key);
    }

    // delete sets to undefined first to cleanup children
    set(node, key, undefined);

    // Then delete the key from the object
    let child = getValueAtPath(node.root, node.path);
    delete child[key];
}

export function prop(node: PathNode, key: string) {
    // prop returns an object with symbolProp
    const prop = {
        [symbolProp]: { node, key },
    };
    Object.defineProperty(prop, '_', createUnderscore(prop, node));
    return prop;
}

export function observable<T extends boolean>(prim: T): ObservablePrimitive<boolean>;
export function observable<T extends string>(prim: T): ObservablePrimitive<string>;
export function observable<T extends number>(prim: T): ObservablePrimitive<number>;
export function observable<T extends boolean | string | number>(prim: T): ObservablePrimitive<T>;
export function observable<T extends object | Array<any>>(obj: T): Observable<T>;
export function observable<T>(obj: any): Observable<T> | ObservablePrimitive<T> {
    const isPrim = isPrimitive(obj);
    // Primitives wrap in current
    if (isPrim) {
        obj = { current: obj };
    }

    const obs = {
        _: obj as Observable,
        pathNodes: new Map(),
    } as ObservableWrapper;

    updateNodes(getPathNode(obs, '_'), obs._);

    if (isPrim) {
        // Bind callbacks to "current" so handlers get the primitive value
        for (let i = 0; i < objectFns.length; i++) {
            const fn = objectFns[i][0];
            obs._._[fn] = obs._._[fn].bind(this, 'current');
        }
    }

    return obs._ as Observable<T>;
}
