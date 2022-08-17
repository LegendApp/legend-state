import { symbolDateModified, symbolIsObservable } from './globals';
import { isObject } from './is';
import type { ObservableType } from './observableInterfaces';

export function isObservable(obs: any): boolean {
    return obs && !!obs[symbolIsObservable as any];
}

export function mergeIntoObservable(target: ObservableType | object, ...sources: any[]) {
    if (!sources.length) return target;

    const source = sources.shift();

    const needsSet = isObservable(target);

    if (isObject(target) && isObject(source)) {
        if (source[symbolDateModified as any]) {
            if (needsSet) {
                target.set(symbolDateModified, source[symbolDateModified as any]);
            } else {
                target[symbolDateModified as any] = source[symbolDateModified as any];
            }
        }
        const value = target.get?.() || target;
        for (const key in source) {
            if (isObject(source[key])) {
                if (!value[key] || !isObject(value[key])) {
                    needsSet ? target.set(key, {}) : (target[key] = {});
                }
                mergeIntoObservable(target[key], source[key]);
            } else {
                needsSet ? target.set(key, source[key]) : (target[key] = source[key]);
            }
        }
    }
    return mergeIntoObservable(target, ...sources);
}
