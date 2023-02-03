import { isArray, isObject, ObservableWriteable, symbolDateModified } from '@legendapp/state';

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

export function mergeDateModified(obs: ObservableWriteable, source: any) {
    const isArr = isArray(source);
    const isObj = !isArr && isObject(source);

    let dateModified = isObj && source[symbolDateModified as any];
    if (dateModified) {
        delete source[symbolDateModified];
    }

    if (isArr || isObj) {
        const keys: any[] = isArr ? (source as any[]) : Object.keys(source);
        for (let i = 0; i < keys.length; i++) {
            const key = isArr ? i : (keys[i] as string);
            dateModified = Math.max(dateModified || 0, mergeDateModified(obs[key], source[key]));
        }
    }

    if (dateModified) {
        obs.peek()[symbolDateModified] = dateModified;
    }

    return dateModified || 0;
}
