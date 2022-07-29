import { isArray } from '@legendapp/tools';
import {
    arrayStartsWith,
    callKeyed,
    getNodeValue,
    getValueAtPath,
    isPrimitive2,
    symbolEqualityFn,
    symbolProp,
    symbolShallow,
} from './globals';
import { EqualityFn, Observable2, ObservableWrapper, PathNode, Shallow } from './observableInterfaces';
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
                const key = node.path[node.path.length - 1];
                let parent = getValueAtPath(node.root, node.path.slice(0, -1));
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

function createNodes(parent: PathNode, obj: Record<any, any>) {
    const isArr = isArray(obj);
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        if (!isPrimitive2(obj[key])) {
            const child: PathNode = {
                path: parent.path.concat(key),
                root: parent.root,
            };
            createNodes(child, obj[key]);
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
        if (node.path.length > 1) {
            return callKeyed(set, node, key);
        } else {
            // Set on the root has to assign
            assign(node, key);
        }
    } else {
        state.inSet = true;
        let child = getNodeValue(node);
        const prevValue = child[key];
        if (!isPrimitive2(child[key])) {
            cleanup(child[key]);
        }
        child[key] = newValue;
        if (!isPrimitive2(newValue)) {
            createNodes({ root: node.root, path: node.path.concat(key) }, newValue);
        }
        state.inSet = false;

        notify(node, newValue, prevValue, node.path.concat(key));
    }
}

function notify(node: PathNode, value: any, prevValue: any, path: string[]) {
    for (let listener of node.root.listeners) {
        if (!listener.shallow || Math.abs(path.length - listener.path.length) < 2) {
            if (arrayStartsWith(path, listener.path)) {
                const pathNotify = path.slice(listener.path.length);
                const child = getValueAtPath(node.root, listener.path);
                listener.callback(child, { path: pathNotify, prevValue, value });
            } else if (arrayStartsWith(listener.path, path)) {
                const child = getValueAtPath(node.root, listener.path);
                const prev = getValueAtPath(prevValue, listener.path.slice(path.length));
                listener.callback(child, { path: [], prevValue: prev, value: child });
            }
        }
    }
}

function assign(node: PathNode, value: any) {
    const keys = Object.keys(value);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        set(node, keys[i], value[keys[i]]);
    }
}

function deleteFn(node: PathNode, key?: string) {
    if (!key) {
        const last = node.path[node.path.length - 1];
        return deleteFn({ path: node.path.slice(0, -1), root: node.root }, last);
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
    const value = getValueAtPath(node.root, node.path.concat(key));
    return {
        [symbolProp]: { node, key, value },
    };
}

export function observable3<T extends object | Array<any>>(obj: T): Observable2<T> {
    const obs = {
        _: obj as Observable2,
        listeners: new Set(),
    } as ObservableWrapper;
    state.inSet = true;
    createNodes(
        {
            root: obs,
            path: [],
        },
        obs
    );
    state.inSet = false;

    return obs._ as Observable2<T>;
}

// const arr = [];
// for (let i = 0; i < 100000; i++) {
//     arr[i] = { id: i };
// }
// console.time('obs3');

// const obs = observable3({ arr });
// obs.arr._on('change', () => console.log('change'));
// obs.arr._set([]);

// for (let i = 0; i < 100000; i++) {
//     obs.arr[i].id;
// }

// console.timeEnd('obs3');

// ((numProps, propsLength, numIter) => {
//     const performance = require('perf_hooks').performance;

//     let arr = [];
//     for (let p = 0; p < numProps; p++) {
//         arr[p] = String(p * propsLength); // numeric keys, sort of an "array"
//     }
//     let t0 = performance.now();
//     for (let p = 0; p < numIter; p++) {
//         let val = 0;
//         const keys = Object.keys(arr);
//         for (let i = 0; i < keys.length; i++) {
//             val += arr[i].length;
//         }
//     }
//     console.log('Keys loop: ' + (performance.now() - t0));

//     t0 = performance.now();
//     for (let p = 0; p < numIter; p++) {
//         let val = 0;
//         for (let i = 0; i < arr.length; i++) {
//             val += arr[i].length;
//         }
//     }
//     console.log('Loop: ' + (performance.now() - t0));

//     // let set = new Set<string>();
//     // for (let p = 0; p < numProps; p++) {
//     //     set.add(String(p * propsLength)); // numeric keys, sort of an "array"
//     // }

//     // console.log("Let's get started!");

//     // let t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     set.forEach((a) => (val += a.length));
//     // }
//     // console.log('Set forEach: ' + (performance.now() - t0));

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     for (let a of set) {
//     //         val += a.length;
//     //     }
//     // }
//     // console.log('Set for of: ' + (performance.now() - t0));

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let sum = 0;
//     //     const values = set.values();
//     //     for (var it = values, val = null; (val = it.next().value); ) {
//     //         sum += val.length;
//     //     }
//     // }
//     // console.log('Set values: ' + (performance.now() - t0));

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let sum = 0;
//     //     const values = Array.from(set);
//     //     for (let i = 0; i < values.length; i++) {
//     //         sum += values[i].length;
//     //     }
//     // }
//     // console.log('Set array loop: ' + (performance.now() - t0));

//     // let obj = {};
//     // for (let p = 0; p < numProps; p++) {
//     //     obj[p] = String(p * propsLength); // numeric keys, sort of an "array"
//     // }
//     // let obj2 = {};
//     // for (let p = 0; p < numProps; p++) {
//     //     obj2[`key${p}`] = String(p * propsLength); // string keys
//     // }
//     // console.log("Let's get started!");

//     // let t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = Object.keys(obj).length;
//     // }
//     // console.log('Object.keys took: ' + (performance.now() - t0) + ' ms for numeric keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = Object.values(obj).length;
//     // }
//     // console.log('Object.values took: ' + (performance.now() - t0) + ' ms for numeric keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = Object.keys(obj2).length;
//     // }
//     // console.log('Object.keys took: ' + (performance.now() - t0) + ' ms for string keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = Object.values(obj2).length;
//     // }
//     // console.log('Object.values took: ' + (performance.now() - t0) + ' ms for string keys');

//     // let t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     Object.keys(obj2).forEach((a) => (val += obj2[a].length));
//     // }
//     // console.log('Object.keys forEach took: ' + (performance.now() - t0) + ' ms for string keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     // @ts-ignore
//     //     Object.values(obj2).forEach((a) => (val += a.length));
//     // }
//     // console.log('Object.values forEach took: ' + (performance.now() - t0) + ' ms for string keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     const keys = Object.keys(obj2);
//     //     for (let i = 0; i < keys.length; i++) {
//     //         val += obj2[keys[i]].length;
//     //     }
//     // }
//     // console.log('Object.keys for loop took: ' + (performance.now() - t0) + ' ms for string keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     const values = Object.values(obj2);
//     //     for (let i = 0; i < values.length; i++) {
//     //         // @ts-ignore
//     //         val += values[i].length;
//     //     }
//     // }
//     // console.log('Object.values for loop took: ' + (performance.now() - t0) + ' ms for string keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     const keys = Object.keys(obj2);
//     //     for (let key of keys) {
//     //         val += obj2[key].length;
//     //     }
//     // }
//     // console.log('Object.keys for of took: ' + (performance.now() - t0) + ' ms for string keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     for (let key in obj2) {
//     //         val += obj2[key].length;
//     //     }
//     // }
//     // console.log('for in took: ' + (performance.now() - t0) + ' ms for string keys');

//     // t0 = performance.now();
//     // for (let p = 0; p < numIter; p++) {
//     //     let val = 0;
//     //     const keys = Object.getOwnPropertyNames(obj2);
//     //     for (let i = 0; i < keys.length; i++) {
//     //         val += obj2[keys[i]].length;
//     //     }
//     // }
//     // console.log('Object.getOwnPropertyNames for loop took: ' + (performance.now() - t0) + ' ms for string keys');
// })(1000, 1, 10000);
