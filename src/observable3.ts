import { isArray } from '@legendapp/tools';
import {
    delim,
    getNodeValue,
    getParentNode,
    getPathNode,
    getValueAtPath,
    hasPathNode,
    isPrimitive2,
    symbolEqualityFn,
    symbolProp,
    symbolShallow,
} from './globals';
import {
    EqualityFn,
    Observable2,
    ObservableListenerInfo2,
    ObservableWrapper,
    PathNode,
    Shallow,
} from './observableInterfaces';
import { onChange, onEquals, onHasValue, onTrue } from './on';

const mapPaths = new WeakMap<object, PathNode>();

const mapFns = new Map<string, Function>([
    ['set', set],
    ['onChange', onChange.bind(this, false)],
    ['onChangeShallow', onChange.bind(this, true)],
    ['onEquals', onEquals],
    ['onHasValue', onHasValue],
    ['onTrue', onTrue],
    ['prop', prop],
    ['assign', assign],
    ['delete', deleteFn],
]);

// function extendPrototypesObject() {
//     const fn = (name: string) =>
//         function (a, b, c) {
//             let node: PathNode;
//             const prop = this[symbolProp];
//             let num = arguments.length;
//             if (prop) {
//                 node = prop.node;
//                 c = b;
//                 b = a;
//                 a = prop.key;
//                 num++;
//             } else {
//                 node = mapPaths.get(this);
//             }
//             if (node) {
//                 const fn = mapFns.get(name);
//                 // Micro-optimize here because it's the core and this is faster than apply.
//                 return num === 3 ? fn(node, a, b, c) : num === 2 ? fn(node, a, b) : num === 1 ? fn(node, a) : fn(node);
//             }
//         };
//     const toOverride = [Object];
//     mapFns.forEach((_, key) => {
//         toOverride.forEach((override) => (override.prototype['_' + key] = fn(key)));
//     });
// }

// extendPrototypesObject();

// function extendPrototypesArray() {
//     const fn = (override: any, name: string) => {
//         const orig = override.prototype[name];
//         return function () {
//             const prevValue = this.slice();
//             const ret = orig.apply(this, arguments);

//             const node = mapPaths.get(this);
//             if (node) {
//                 const parentNode = getParentNode(node);
//                 if (parentNode) {
//                     const parent = getNodeValue(parentNode);
//                     parent[node.key] = prevValue;

//                     set(node, this);
//                 }
//             }

//             return ret;
//         };
//     };
//     const toOverride = [Array];
//     ['push', 'splice'].forEach((key) => {
//         toOverride.forEach((override) => (override.prototype[key] = fn(override, key)));
//     });
// }
// extendPrototypesArray();

export function set3(a, b, c) {
    // console.log('setting');
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
        node = mapPaths.get(this);
    }
    if (node) {
        const fn = set;
        // Micro-optimize here because it's the core and it's faster than apply.
        // @ts-ignore;
        return num === 3 ? fn(node, a, b, c) : num === 2 ? fn(node, a, b) : num === 1 ? fn(node, a) : fn(node);
    }
}
export function on3(a, b, c) {
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
        node = mapPaths.get(this);
    }
    if (node) {
        const fn = mapFns.get('onChange');
        // Micro-optimize here because it's the core and it's faster than apply.
        return num === 3 ? fn(node, a, b, c) : num === 2 ? fn(node, a, b) : num === 1 ? fn(node, a) : fn(node);
    }
}

const descriptors: PropertyDescriptorMap = {
    _set: {
        enumerable: false,
        value: set3,
    },
    _onChange: {
        enumerable: false,
        value: on3,
    },
};

const descriptorsArray: PropertyDescriptorMap = {
    push: {
        enumerable: false,
        value() {
            console.log('called push', this);
            return Array.prototype.push.apply(this, arguments);
        },
    },
    // _onChange: {
    //     enumerable: false,
    //     value: on3,
    // },
};

function createNodes(parent: PathNode, obj: Record<any, any>, prevValue?: any) {
    const isArr = isArray(obj);
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        const isObj = !isPrimitive2(obj[key]);
        const doNotify = prevValue && obj[key] !== prevValue[key] && hasPathNode(parent.root, parent.path, key);
        const child = (isObj || doNotify) && getPathNode(parent.root, parent.path, key);
        if (isObj) {
            createNodes(child, obj[key], prevValue?.[key]);
        }
        if (doNotify) {
            _notify(child, { path: [], prevValue: prevValue[key], value: obj[key] });
        }
    }
    if (!mapPaths.has(obj)) {
        Object.defineProperties(obj, descriptors);
        if (isArray(obj)) {
            Object.defineProperties(obj, descriptorsArray);
        }
    }
    mapPaths.set(obj, parent);
}

function cleanup(obj: object) {
    const isArr = isArray(obj);
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        if (!isPrimitive2(obj[key])) {
            cleanup(obj[key]);
        }
    }
    mapPaths.delete(obj);
}

function set(node: PathNode, newValue: any): any;
function set(node: PathNode, key: string, newValue: any): any;
function set(node: PathNode, key: string, newValue?: any): any {
    if (arguments.length < 3) {
        if (node.path.includes(delim)) {
            return set(getParentNode(node), node.key, key);
        } else {
            // Set on the root has to assign
            assign(node, key);
        }
    } else {
        let parentValue = getNodeValue(node);
        const prevValue = parentValue[key];

        if (!isPrimitive2(parentValue[key])) {
            cleanup(parentValue[key]);
        }
        parentValue[key] = newValue;

        const childNode = getPathNode(node.root, node.path, key);
        if (!isPrimitive2(newValue)) {
            createNodes(childNode, newValue, prevValue);
        }

        notify(childNode, newValue, prevValue);
    }
}

function _notify(node: PathNode, listenerInfo: ObservableListenerInfo2, value?: any) {
    if (node.listeners) {
        value = value ? value : getNodeValue(node);
        for (let listener of node.listeners) {
            listener.callback(value, listenerInfo);
        }
    }
}

function _notifyUp(node: PathNode, listenerInfo: ObservableListenerInfo2, value?: any) {
    _notify(node, listenerInfo, value);
    if (node.path !== '_') {
        const parent = getParentNode(node);

        const parentListenerInfo = Object.assign({}, listenerInfo);
        parentListenerInfo.path = [node.key].concat(listenerInfo.path);
        _notifyUp(parent, parentListenerInfo);
    }
}
function notify(node: PathNode, value: any, prevValue: any) {
    const listenerInfo = { path: [], prevValue, value };
    _notifyUp(node, listenerInfo);
}

function assign(node: PathNode, value: any) {
    const keys = Object.keys(value);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        set(node, keys[i], value[keys[i]]);
    }
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

export function shallow(obs: Observable2): Shallow {
    return {
        [symbolShallow]: obs,
    };
}
export function equalityFn(obs: Observable2, fn: (value) => any): EqualityFn {
    return {
        [symbolEqualityFn]: { obs, fn },
    };
}

export function prop(node: PathNode, key: string) {
    return {
        [symbolProp]: { node, key },
    };
}

export function observable3<T extends object | Array<any>>(obj: T): Observable2<T> {
    if (isPrimitive2(obj)) return undefined;

    const obs = {
        _: obj as Observable2,
        pathNodes: new Map(),
    } as ObservableWrapper;

    createNodes(getPathNode(obs, '_'), obs._);

    return obs._ as Observable2<T>;
}
