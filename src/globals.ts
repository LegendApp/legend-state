import { isArray, isObject } from '@legendapp/tools';
import type { Observable, ObservableTrigger } from './observableInterfaces';
import { state } from './observableState';
import { config } from './configureObservable';

export const symbolDateModified = Symbol('__dateModified');
export const symbolShallow = Symbol('__shallow');

export function constructObject(path: string[], value: any, dateModified?: any) {
    let out = {};
    let o = out;
    if (path.length > 0) {
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            o[p] = i === path.length - 1 ? value : {};
            o = o[p];
        }
    } else {
        out = o = value;
    }

    if (dateModified) {
        if (isObject(o)) {
            o[symbolDateModified as any] = dateModified;
        } else {
            out[symbolDateModified as any] = dateModified;
        }
    }

    return out;
}

export function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    const needsSet = isObservable(target);
    const targetValue = needsSet ? target.get() : target;

    if (isObject(targetValue) && isObject(source)) {
        if (source[symbolDateModified as any]) {
            if (needsSet) {
                target.set(symbolDateModified, source[symbolDateModified as any]);
            } else {
                target[symbolDateModified as any] = source[symbolDateModified as any];
            }
        }
        for (const key in source) {
            if (isObject(source[key])) {
                if (!isObject(targetValue[key])) {
                    if (needsSet) {
                        target.set(key, {});
                    } else {
                        target[key] = {};
                    }
                }
                if (!targetValue[key]) {
                    if (needsSet) {
                        target.assign({ [key]: {} });
                    } else {
                        Object.assign(target, { [key]: {} });
                    }
                }
                mergeDeep(target[key], source[key]);
            } else {
                if (isObservable(target)) {
                    target.assign({ [key]: source[key] });
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
    }
    return mergeDeep(target, ...sources);
}

export function isNullOrUndefined(val: any) {
    return val === null || val === undefined;
}

export function isObservable(obj: any): obj is Observable {
    return state.infos.has(obj);
}

export function isTrigger(obj: any): obj is ObservableTrigger {
    return isObject(obj) && obj.hasOwnProperty('notify') && obj.hasOwnProperty('on');
}

export function removeNullUndefined<T extends Record<string, any>>(a: T) {
    if (a === undefined) return null;
    Object.keys(a).forEach((key) => {
        const v = a[key];
        if (v === null || v === undefined) {
            delete a[key];
        } else if (isObject(v)) {
            removeNullUndefined(v);
        }
    });
}

export function objectAtPath(path: string[], value: object) {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        if (o) {
            const p = path[i];
            o = o[p] || o['__dict'] || o['__obj']?.[p];
        }
    }

    return o;
}

export function replaceKeyInObject(obj: object, keySource: any, keyTarget: any, clone: boolean) {
    if (isObject(obj)) {
        const target = clone ? {} : obj;
        if (obj[keySource]) {
            target[keyTarget] = obj[keySource];
            delete target[keySource];
        }
        Object.keys(obj).forEach((key) => {
            if (key !== keySource) {
                target[key] = replaceKeyInObject(obj[key], keySource, keyTarget, clone);
            }
        });
        return target;
    } else {
        return obj;
    }
}

export function isPrimitive(val: any) {
    return (
        !isObject(val) &&
        !isArray(val) &&
        !(val instanceof WeakMap) &&
        !(val instanceof WeakSet) &&
        !(val instanceof Error) &&
        !(val instanceof Date) &&
        !(val instanceof String) &&
        !(val instanceof ArrayBuffer)
    );
}

export function isCollection(obj: any) {
    return isArray(obj) || obj instanceof Map || obj instanceof Set || obj instanceof WeakMap || obj instanceof WeakSet;
}

export function isObjectEmpty(obj: object) {
    return obj && Object.keys(obj).length === 0;
}
export function getDateModifiedKey(dateModifiedKey: string) {
    return dateModifiedKey || config.persist?.dateModifiedKey || '@';
}
export function jsonEqual(obj1: any, obj2: any) {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

export function clone(obj: any) {
    return obj === undefined || obj === null ? obj : JSON.parse(JSON.stringify(obj));
}
