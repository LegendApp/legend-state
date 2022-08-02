import { symbolDateModified, symbolShouldRender, symbolShallow } from './globals';
import { isObject } from './is';
import type { ShouldRender, Observable, Shallow } from './observableInterfaces';

export function shallow(obs: Observable): Shallow {
    return {
        [symbolShallow]: obs,
    };
}
export function shouldRender<T>(obs: Observable<T>, fn: (value: T, prev: T) => any): ShouldRender {
    return {
        [symbolShouldRender]: { obs, fn },
    };
}

export function mergeIntoObservable(target: Observable, ...sources: any[]) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        if (source[symbolDateModified as any]) {
            target.setProp(symbolDateModified, source[symbolDateModified as any]);
        }
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key] || !isObject(target[key])) {
                    target.setProp(key, {});
                }
                mergeIntoObservable(target[key], source[key]);
            } else {
                target.setProp(key, source[key]);
            }
        }
    }
    return mergeIntoObservable(target, ...sources);
}
