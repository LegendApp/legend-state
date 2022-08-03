import { isPrimitive } from './is';
import { ObservableChecker, ProxyValue } from './observableInterfaces';
import state from './state';

export const delim = '\uFEFF';

export const symbolDateModified = Symbol('dateModified');
export const symbolShallow = Symbol('shallow');
export const symbolShouldRender = Symbol('shouldRender');
export const symbolValue = Symbol('value');
export const symbolProp = Symbol('prop');
export const symbolID = Symbol('id');
export const symbolGet = Symbol('get');

export function getNodeValue(node: ProxyValue): any {
    let child = node.root;
    const arr = node.path.split(delim);
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] !== undefined && child) {
            child = child[arr[i]];
        }
    }
    return child;
}

export function getParentNode(node: ProxyValue): { parent: ProxyValue; key: string } {
    if (node.path === '_') return { parent: node, key: undefined };
    const parent = node.root.proxyValues.get(node.pathParent);
    return { parent, key: node.key };
}

export function getChildNode(node: ProxyValue, key: string): ProxyValue {
    const path = node.path + delim + key;
    let child = node.root.proxyValues.get(path);
    if (!child) {
        // console.log('creating child', node.path, key);
        child = {
            root: node.root,
            path: node.path + delim + key,
            // arr: node.arr.concat(key),
            // arrParent: node.arr,
            pathParent: node.path,
            key,
        };
        node.root.proxyValues.set(path, child);
    }

    return child;
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
