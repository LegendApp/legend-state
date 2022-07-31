import { isObject } from '@legendapp/tools';
import { symbolDateModified } from './globals';
import { Observable } from './observableInterfaces';

export function mergeIntoObservable(target: Observable, ...sources: any[]) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        if (source[symbolDateModified as any]) {
            target._.set(symbolDateModified, source[symbolDateModified as any]);
        }
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key] || !isObject(target[key])) {
                    target._.set(key, {});
                }
                mergeIntoObservable(target[key], source[key]);
            } else {
                target._.set(key, source[key]);
            }
        }
    }
    return mergeIntoObservable(target, ...sources);
}
