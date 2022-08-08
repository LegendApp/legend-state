import { symbolDateModified, symbolIsObservable, symbolShallow } from './globals';
import { isObject } from './is';
import type { Observable, ObservableType, Shallow } from './observableInterfaces';

export function shallow(obs: ObservableType): Shallow {
    return {
        [symbolShallow]: obs,
    };
}
export function isObservable(obs: any): obs is ObservableType {
    return obs && !!obs[symbolIsObservable as any];
}

export function mergeIntoObservable(target: ObservableType, ...sources: any[]) {
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
