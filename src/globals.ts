import { tracking } from './state';
import { isFunction, isPrimitive, isString } from './is';
import { ObservableTypeRender, NodeValue } from './observableInterfaces';

export const symbolDateModified = Symbol('dateModified');
export const symbolShallow = Symbol('shallow');
export const symbolGet = Symbol('get');
export const symbolIsObservable = Symbol('isObservable');

export function getNodeValue(node: NodeValue): any {
    const arr: (string | number)[] = [];
    let n = node;
    while (n?.key !== undefined) {
        arr.push(n.key);
        n = n.parent;
    }
    let child = node.root._;
    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] !== undefined && child) {
            child = child[arr[i]];
        }
    }
    return child;
}

export function getChildNode(node: NodeValue, key: string | number): NodeValue {
    if (isString(key)) {
        const n = +key;
        // Convert to number if it's a string representing a valid number
        if (n - n < 1) key = n;
    }

    // Get the child by id if included, or by key
    let child = node.children?.get(key);

    // Create the child node if it doesn't already exist
    if (!child) {
        child = {
            root: node.root,
            parent: node,
            key,
            // id,
        };
        if (!node.children) {
            node.children = new Map();
        }
        node.children.set(key, child);
    }

    return child;
}

export function getObservableRawValue<T>(obs: ObservableTypeRender<T>): T {
    if (!obs || isPrimitive(obs)) return obs as T;
    if (isFunction(obs)) return obs();

    const shallow = obs?.[symbolShallow];
    if (shallow) {
        tracking.shallow = true;
        obs = shallow;
    }
    let ret = obs?.[symbolGet];

    tracking.shallow = false;

    return ret;
}
