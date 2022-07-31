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
import { isArray, isPrimitive } from './is';
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

const wrapFn = (fn: Function) =>
    function (a, b, c) {
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
            // Micro-optimize here because it's the core and this is faster than apply.
            return num === 3 ? fn(node, a, b, c) : num === 2 ? fn(node, a, b) : num === 1 ? fn(node, a) : fn(node);
        } else {
            console.error('Node not found, unable to call function on observable');
        }
    };

for (let i = 0; i < objectFns.length; i++) {
    objectFns[i][1] = wrapFn(objectFns[i][1]);
}

const descriptorsArray: PropertyDescriptorMap = {};
['push', 'splice'].forEach((key) => {
    descriptorsArray[key] = {
        value() {
            const prevValue = this.slice();
            const ret = Array.prototype[key].apply(this, arguments);

            const node = getObjectNode(this);
            if (node) {
                const parentNode = getParentNode(node);
                if (parentNode) {
                    const parent = getNodeValue(parentNode);
                    parent[node.key] = prevValue;

                    set(node, this);
                }
            }

            return ret;
        },
    };
});

function boundObjDescriptors(obj: any, node: PathNode): PropertyDescriptor {
    const id = nextID++;
    const out = {
        [symbolID]: id,
    };
    arrPaths[id] = node;
    for (let i = 0; i < objectFns.length; i++) {
        const [key, fn] = objectFns[i];
        out[key] = fn.bind(obj);
    }
    return {
        enumerable: false,
        configurable: false,
        writable: false,
        value: out,
    };
}

function updateNodes(parent: PathNode, obj: Record<any, any>, prevValue?: any) {
    const isArr = isArray(obj);
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        const isObj = !isPrimitive(obj[key]);
        const doNotify =
            prevValue && !isArr && obj[key] !== prevValue[key] && hasPathNode(parent.root, parent.path, key);
        const child = (isObj || doNotify) && getPathNode(parent.root, parent.path, key);
        if (isObj) {
            updateNodes(child, obj[key], prevValue?.[key]);
        }
        if (doNotify) {
            _notify(child, { path: [], prevValue: prevValue[key], value: obj[key] });
        }
    }
    const hasDefined = obj._;
    if (!hasDefined) {
        Object.defineProperty(obj, '_', boundObjDescriptors(obj, parent));
        if (isArray(obj)) {
            Object.defineProperties(obj, descriptorsArray);
        }
    }
}

function cleanup(node: PathNode, newValue: object, prevValue: object) {
    const isArr = isArray(prevValue);
    const keys = isArr ? prevValue : Object.keys(prevValue);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        const child = getPathNode(node.root, node.path, key, /*noCreate*/ true);
        if (child) {
            cleanup(child, newValue?.[key], prevValue[key]);
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
            return set(getParentNode(node), node.key, key);
        } else {
            // Set on the root has to assign
            return assign(node, key);
        }
    } else {
        const childNode = getPathNode(node.root, node.path, key);

        let parentValue = getNodeValue(node);
        const prevValue = parentValue[key];

        parentValue[key] = newValue;

        if (!isPrimitive(prevValue)) {
            cleanup(childNode, newValue, prevValue);
        }

        const isPrim = isPrimitive(newValue);

        if (!isPrim) {
            updateNodes(childNode, newValue, prevValue);
        }

        if (!isPrim || newValue !== prevValue) {
            notify(childNode, newValue, prevValue, prevValue == undefined || isArray(parentValue) ? -1 : 0);
        }
    }

    return newValue;
}

function _notify(node: PathNode, listenerInfo: ObservableListenerInfo, levelsUp?: number) {
    if (node.listeners) {
        const value = getNodeValue(node);
        for (let listener of node.listeners) {
            if (!listener.shallow || levelsUp <= 0) {
                observableBatcherNotify(listener.callback, value, listenerInfo);
            }
        }
    }
}

function _notifyParents(node: PathNode, listenerInfo: ObservableListenerInfo, levelsUp?: number) {
    _notify(node, listenerInfo, levelsUp);
    if (node.path !== '_') {
        const parent = getParentNode(node);

        const parentListenerInfo = Object.assign({}, listenerInfo);
        parentListenerInfo.path = [node.key].concat(listenerInfo.path);
        _notifyParents(parent, parentListenerInfo, levelsUp + 1);
    }
}
function notify(node: PathNode, value: any, prevValue: any, level) {
    const listenerInfo = { path: [], prevValue, value };
    _notifyParents(node, listenerInfo, level);
}

function assign(node: PathNode, value: any) {
    observableBatcher.begin();

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
    if (!node.path) return;
    if (arguments.length < 2) {
        return deleteFn(getParentNode(node), node.key);
    }

    set(node, key, undefined);

    let child = getValueAtPath(node.root, node.path);

    delete child[key];
}

export function prop(node: PathNode, key: string) {
    const prop = {
        [symbolProp]: { node, key },
    };
    Object.defineProperty(prop, '_', boundObjDescriptors(prop, node));
    return prop;
}

export function observable<T extends boolean>(prim: T): ObservablePrimitive<boolean>;
export function observable<T extends string>(prim: T): ObservablePrimitive<string>;
export function observable<T extends number>(prim: T): ObservablePrimitive<number>;
export function observable<T extends boolean | string | number>(prim: T): ObservablePrimitive<T>;
export function observable<T extends object | Array<any>>(obj: T): Observable<T>;
export function observable<T>(obj: any): Observable<T> | ObservablePrimitive<T> {
    const isPrim = isPrimitive(obj);
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
