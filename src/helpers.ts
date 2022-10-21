import { symbolDateModified, symbolDelete, symbolGetNode, symbolIsObservable } from './globals';
import { isFunction, isObject, isObjectEmpty } from './is';
import type { NodeValue, ObservableObject, ObservableReadable, ObserveEvent, Selector } from './observableInterfaces';

export function isObservable(obs: any): obs is ObservableObject {
    return obs && !!obs[symbolIsObservable as any];
}

export function computeSelector<T>(selector: Selector<T>, e?: ObserveEvent<T>) {
    let c = selector as any;
    if (isFunction(c)) {
        c = e ? c(e) : c();
    }

    return isObservable(c) ? c.get() : c;
}

export function getNode(obs: ObservableReadable): NodeValue {
    return obs[symbolGetNode];
}

export function lockObservable(obs: ObservableReadable, value: boolean) {
    const root = getNode(obs)?.root;
    if (root) {
        root.locked = value;
    }
}
export function mergeIntoObservable(target: ObservableObject | object, ...sources: any[]) {
    if (!sources.length) return target;

    const source = sources.shift();

    const needsSet = isObservable(target);

    const isTargetObj = isObject(target);

    if (isTargetObj && isObject(source)) {
        const value = isObservable(target) ? target.peek() : target;
        const keys: (Symbol | string)[] = Object.keys(source);
        if (source[symbolDateModified as any]) {
            keys.push(symbolDateModified);
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i] as string;
            const sourceValue = source[key];
            if (isObject(sourceValue) && !isObjectEmpty(sourceValue)) {
                if (!needsSet && (!value[key] || !isObject(value[key]))) {
                    target[key] = {};
                }
                mergeIntoObservable(target[key], sourceValue);
            } else if (sourceValue === symbolDelete) {
                needsSet && target[key]?.delete ? target[key].delete() : delete target[key];
            } else {
                needsSet && target[key]?.set ? target[key].set(sourceValue) : (target[key] = sourceValue);
            }
        }
    } else if (needsSet && !(isTargetObj && source === undefined)) {
        target.set(source);
    }
    return mergeIntoObservable(target, ...sources);
}
