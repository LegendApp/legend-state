import { isArray, isObject } from '@legendapp/tools';
import { observableConfiguration } from './configureObservable';

export const symbolDateModified = Symbol('__dateModified');
export const symbolShallow = Symbol('__shallow');

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

export function getDateModifiedKey(dateModifiedKey: string) {
    return dateModifiedKey || observableConfiguration.dateModifiedKey || '@';
}
export function jsonEqual(obj1: any, obj2: any) {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

export function clone(obj: any) {
    return obj === undefined || obj === null ? obj : JSON.parse(JSON.stringify(obj));
}
