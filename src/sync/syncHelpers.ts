import { isObject } from '@legendapp/state';

export function removeNullUndefined<T extends Record<string, any>>(val: T) {
    if (val) {
        Object.keys(val).forEach((key) => {
            const v = val[key];
            if (v === null || v === undefined) {
                delete val[key];
            } else if (isObject(v)) {
                removeNullUndefined(v);
            }
        });
    }
    return val;
}
