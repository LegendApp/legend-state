import { isObject } from '@legendapp/tools';

export function constructObject(path: string[], value: any, extra?: any) {
    const out = {};
    let o = out;
    const extraIndex = Math.max(path.length - 1, 0);
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o[p] = i === path.length - 1 ? value : {};
        if (extra && i === extraIndex) {
            Object.assign(o, extra);
        }
        o = o[p];
    }

    return out;
}
export function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
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
