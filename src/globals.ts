import { isPrimitive } from './is';
import { ObservableChecker, ProxyValue } from './observableInterfaces';
import state from './state';

export const delim = '\uFEFF';
export const arrPaths = [];

export const symbolDateModified = Symbol('dateModified');
export const symbolShallow = Symbol('shallow');
export const symbolShouldRender = Symbol('shouldRender');
export const symbolValue = Symbol('value');
export const symbolProp = Symbol('prop');
export const symbolID = Symbol('id');
export const symbolGet = Symbol('get');

export function getNodeValue(node: ProxyValue): any {
    let child = node.root;
    const arr = node.arr;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] && child) {
            child = child[arr[i]];
        }
    }
    return child;
}
export function getProxyValue(node: ProxyValue) {
    return getNodeValue(node);
}

export function getParentNode(node: ProxyValue) {
    if (node.arr.length <= 1) return { parent: node, key: undefined };
    const key = node.arr[node.arr.length - 1];
    const arrParent = node.arr.slice(0, -1);
    return { parent: { root: node.root, arr: arrParent, path: arrParent.join(delim) }, key };
}

export function getChildNode(node: ProxyValue, key: string): ProxyValue {
    return { root: node.root, path: node.path + delim + key, arr: node.arr.concat(key) };
}

// export function getObjectNode(obj: any) {
//     const id = obj._?.id;
//     if (id !== undefined) {
//         return arrPaths[id];
//     }
// }

export function get(node: ProxyValue) {
    return getNodeValue(node);
}

export function getObservableRawValue<T>(obs: ObservableChecker<T>): T {
    if (!obs || isPrimitive(obs)) return obs as T;

    const eq = obs[symbolShouldRender];
    if (eq) {
        state.trackingShouldRender = eq.fn;
        obs = eq.obs;
    }
    const shallow = obs[symbolShallow];
    if (shallow) {
        state.trackingShallow = true;
        obs = shallow;
    }
    let ret = obs[symbolGet];

    state.trackingShouldRender = undefined;
    state.trackingShallow = false;

    return ret;
}
