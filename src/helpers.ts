import { symbolDateModified, symbolGetNode, symbolIsObservable } from './globals';
import { isObject } from './is';
import type { NodeValue, ObservableObject, ObservableRef } from './observableInterfaces';
import { ObservablePrimitiveClass } from './ObservablePrimitive';

export function isObservable(obs: any): obs is ObservableObject {
    return obs && (obs instanceof ObservablePrimitiveClass || !!obs[symbolIsObservable as any]);
}

export function getNode(obs: ObservableRef): NodeValue {
    return obs instanceof ObservablePrimitiveClass ? obs.getNode() : obs[symbolGetNode];
}

export function lockObservable(obs: ObservableRef, value: boolean) {
    const root = getNode(obs)?.root;
    if (root) {
        root.locked = value;
    }
}
export function mergeIntoObservable(target: ObservableObject | object, ...sources: any[]) {
    if (!sources.length) return target;

    const source = sources.shift();

    const needsSet = isObservable(target);

    if (isObject(target) && isObject(source)) {
        if (source[symbolDateModified as any]) {
            if (needsSet) {
                // @ts-ignore
                target[symbolDateModified].set(source[symbolDateModified as any]);
            } else {
                target[symbolDateModified as any] = source[symbolDateModified as any];
            }
        }
        const value = (target as any).peek?.() || target;
        for (const key in source) {
            if (isObject(source[key])) {
                if (!needsSet && (!value[key] || !isObject(value[key]))) {
                    target[key] = {};
                }
                mergeIntoObservable(target[key], source[key]);
            } else {
                needsSet ? target[key].set(source[key]) : (target[key] = source[key]);
            }
        }
    }
    return mergeIntoObservable(target, ...sources);
}
