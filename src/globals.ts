import { isArray, isObject } from '@legendapp/tools';
import { ObsProxy } from './ObsProxyInterfaces';
import { state } from './ObsProxyState';
import { config } from './configureObsProxy';

export const symbolDateModified = Symbol('__dateModified');

export function constructObject(path: string[], value: any, dateModified?: any) {
    const out = {};
    let o = out;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o[p] = i === path.length - 1 ? value : {};
        o = o[p];
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

    const needsSet = isProxy(target);
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
                if (isProxy(target)) {
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

export function isProxy(obj: any): obj is ObsProxy {
    return state.infos.has(obj);
}

export function removeNullUndefined<T extends Record<string, any>>(a: T) {
    if (a === undefined) return null;
    // @ts-ignore
    Object.keys(a).forEach((key) => {
        const v = a[key];
        if (v === null || v === undefined) {
            delete a[key];
        } else if (isObject(v)) {
            removeNullUndefined(v);
        }
    });
}

// export function removeUndefined<T extends Record<string, any>>(a: T): T {
//     if (a === undefined) return null;
//     // @ts-ignore
//     const out: T = {};
//     Object.keys(a).forEach((key) => {
//         const v = a[key];
//         if (v !== undefined) {
//             // @ts-ignore
//             out[key] = isObject(v) ? removeUndefined(v) : v;
//         }
//     });

//     return out;
// }

export function objectAtPath(path: string[], value: object) {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        if (o) {
            const p = path[i];
            o = o[p] || o['__dict'];
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
