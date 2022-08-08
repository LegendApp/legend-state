import { symbolDateModified, symbolIsObservable, symbolShallow } from './globals';
import { isObject } from './is';
import type { Observable, Shallow } from './observableInterfaces';

export function shallow(obs: Observable): Shallow {
    return {
        [symbolShallow]: obs,
    };
}
export function isObservable(obs: any): boolean {
    return obs && !!obs[symbolIsObservable as any];
}

export function mergeIntoObservable(target: Observable, ...sources: any[]) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        if (source[symbolDateModified as any]) {
            target.set(symbolDateModified, source[symbolDateModified as any]);
        }
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key] || !isObject(target[key])) {
                    target.set(key, {});
                }
                mergeIntoObservable(target[key], source[key]);
            } else {
                target.set(key, source[key]);
            }
        }
    }
    return mergeIntoObservable(target, ...sources);
}
