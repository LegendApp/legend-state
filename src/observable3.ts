import { isArray } from '@legendapp/tools';
import {
    arrayStartsWith,
    callKeyed,
    delim,
    getNodeValue,
    getParentNode,
    getPathNode,
    getValueAtPath,
    hasPathNode,
    isPrimitive2,
    splitLastDelim,
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

const state = {
    mapPaths: new WeakMap<object, PathNode>(),
    fromKey: false,
    inSet: false,
};

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

function extendPrototypesObject() {
    const fn = (name: string) =>
        function (...args: any[]) {
            if (!mapFns.get(name)) debugger;
            const prop = this[symbolProp];
            const node = prop?.node || state.mapPaths.get(this);
            if (prop) {
                args.unshift(prop.key);
            }
            if (node) {
                return mapFns.get(name).apply(this, [node, ...args]);
            }
        };
    const toOverride = [Object];
    mapFns.forEach((_, key) => {
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
                const [path, key] = splitLastDelim(node.path);
                // const key = node.path[node.path.length - 1];
                let parent = getValueAtPath(node.root, path);
                parent[key] = prevValue;

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
    state.mapPaths.set(obj, parent);
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
    state.mapPaths.delete(obj);
}

function set(node: PathNode, newValue: any): any;
function set(node: PathNode, key: string, newValue: any): any;
function set(node: PathNode, key: string, newValue?: any): any {
    if (arguments.length < 3) {
        if (node.path.includes(delim)) {
            return callKeyed(set, node, key);
        } else {
            // Set on the root has to assign
            assign(node, key);
        }
    } else {
        state.inSet = true;
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
        state.inSet = false;

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
        const [path, key] = splitLastDelim(node.path);
        const parent = getPathNode(node.root, path);

        const parentListenerInfo = Object.assign({}, listenerInfo);
        parentListenerInfo.path = [key].concat(listenerInfo.path);
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
    if (arguments.length < 2) {
        return callKeyed(deleteFn, node);
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
    state.inSet = true;
    createNodes(
        {
            root: obs,
            path: '_',
        },
        obs._
    );
    state.inSet = false;

    return obs._ as Observable2<T>;
}
