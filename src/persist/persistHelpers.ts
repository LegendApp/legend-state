import { observablePersistConfiguration } from './configureObservablePersistence';
import { isObject } from '@legendapp/state';

export function removeNullUndefined<T extends Record<string, any>>(val: T) {
    if (val === undefined) return null;
    Object.keys(val).forEach((key) => {
        const v = val[key];
        if (v === null || v === undefined) {
            delete val[key];
        } else if (isObject(v)) {
            removeNullUndefined(v);
        }
    });
    return val;
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

export function getDateModifiedKey(dateModifiedKey: string) {
    return dateModifiedKey || observablePersistConfiguration.dateModifiedKey || '@';
}
