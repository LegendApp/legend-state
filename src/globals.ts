import { isObject } from '@legendapp/tools';

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

export function removeNullUndefined<T extends Record<string, any>>(a: T): T {
    if (a === undefined) return null;
    // @ts-ignore
    const out: T = {};
    Object.keys(a).forEach((key) => {
        const v = a[key];
        if (v !== null && v !== undefined) {
            // @ts-ignore
            out[key] = isObject(v) ? removeNullUndefined(v) : v;
        }
    });

    return out;
}

export function objectAtPath(path: string[], value: object) {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        if (o) {
            const p = path[i];
            o = o[p];
        }
    }

    return o;
}
