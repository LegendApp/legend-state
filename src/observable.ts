import {
    arrPaths,
    delim,
    getNodeValue,
    getObjectNode,
    getParentNode,
    getPathNode,
    getProxyValue,
    hasPathNode,
    symbolGet,
    symbolID,
    symbolProp,
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

const proxies = new Map<string, object>();

let didOverride = false;
export function extendPrototypes() {
    if (!didOverride) {
        didOverride = true;
        const fn = (name: string) =>
            function (...args: any) {
                debugger;
                // const obs = getObservableFromPrimitive(this);
                // if (obs) {
                //     return obs[name](...args);
                // }
            };
        const toOverride = [Number, Boolean, String];
        ['assign', 'get', 'on', 'set', 'delete'].forEach((key) => {
            toOverride.forEach((override) => (override.prototype[key] = fn(key)));
        });
    }
}
extendPrototypes();

const objectFnsProxy = new Map<string, Function>([
    ['set', proxySet],
    ['onChange', onChange],
    ['onChangeShallow', onChangeShallow],
    ['onEquals', onEquals],
    ['onHasValue', onHasValue],
    ['onTrue', onTrue],
    // ['prop', prop],
    ['assign', assign],
    ['delete', deleteFnProxy],
]);

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
    proxies.set(node.path, proxy);
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
            if (prop === symbolGet) {
                return value;
            } else if (prop === 'get') {
                return () => value;
            } else if (isFunction(value[prop])) {
                return value[prop].bind(value);
            } else if (isPrimitive(value[prop])) {
                return value[prop];
            } else {
                const path = target.path + delim + prop;
                let proxy = proxies.get(path);
                if (!proxy) {
                    const child = getPathNode(node.root, target.path, prop);

                    proxy = createProxy(child);
                }
                return proxy;
            }
        }
    },
    ownKeys(target) {
        const value = getProxyValue(target);
        return Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(target, p) {
        if (p === symbolID) {
            return descriptorNotEnumerable;
        }

        const value = getProxyValue(target);
        return Reflect.getOwnPropertyDescriptor(value, p);
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
        proxies.delete(node.path);
    }
}

function proxySet(node: PathNode, newValue: any) {
    return set(getParentNode(node), node.key, newValue);
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

function deleteFnProxy(node: PathNode) {
    return deleteFn(getParentNode(node), node.key);
}
function deleteFn(node: PathNode, key?: string) {
    // delete sets to undefined first to cleanup children
    set(node, key, undefined);

    // Then delete the key from the object
    let child = getNodeValue(node);
    delete child[key];
}

// export function prop(node: PathNode, key: string) {
//     // prop returns an object with symbolProp
//     const prop = {
//         [symbolProp]: { node, key },
//     };
//     Object.defineProperty(prop, '_', createUnderscore(prop, node));
//     return prop;
// }

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
        pathNodes: new Map(),
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

// ((numProps, propsLength, numIter) => {
//     const performance = require('perf_hooks').performance;

//     let arr = [];
//     for (let p = 0; p < numProps; p++) {
//         arr[p] = { text: String(p * propsLength) }; // numeric keys, sort of an "array"
//     }

//     let t0;
//     function test() {
//         // doProxy = false;
//         // let t0 = performance.now();
//         // for (let p = 0; p < numIter; p++) {
//         //     const obs = observable({ text: arr[p] });
//         // }
//         // console.log('no proxy: ' + (performance.now() - t0));

//         // doProxy = true;
//         // t0 = performance.now();
//         // for (let p = 0; p < numIter; p++) {
//         //     const obs = observable({ text: arr[p] });
//         // }
//         // console.log('proxy: ' + (performance.now() - t0));

//         t0 = performance.now();
//         for (let i = 0; i < numIter; i++) {
//             for (let p = 0; p < numProps; p++) {
//                 const obj = arr[p];
//                 obj[symbolID] = obj.text;
//             }
//         }
//         console.log('assign: ' + (performance.now() - t0));
//         t0 = performance.now();
//         for (let i = 0; i < numIter; i++) {
//             for (let p = 0; p < numProps; p++) {
//                 const obj = arr[p];
//                 Object.defineProperty(obj, symbolID, {
//                     enumerable: false,
//                     configurable: false,
//                     value: obj.text,
//                 });
//             }
//         }
//         console.log('defineProperty: ' + (performance.now() - t0));

//         // doProxy = true;
//     }
//     test();
//     test();
//     test();
//     test();
//     test();
// })(1000, 1, 10000);
