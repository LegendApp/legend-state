import { isDate, isNullOrUndefined, isObject } from '@legendapp/state';

export function removeNullUndefined<T extends Record<string, any>>(a: T, recursive?: boolean): T {
    const out: T = {} as T;
    Object.keys(a).forEach((key: keyof T) => {
        if (a[key] !== null && a[key] !== undefined) {
            out[key] = recursive && isObject(a[key]) ? removeNullUndefined(a[key]) : a[key];
        }
    });

    return out;
}

export function diffObjects<T extends Record<string, any>>(obj1: T, obj2: T, deep: boolean = false): Partial<T> {
    const diff: Partial<T> = {};
    if (!obj1) return obj2 || diff;
    if (!obj2) return obj1 || diff;

    const keys = new Set<keyof T>([...Object.keys(obj1), ...Object.keys(obj2)] as (keyof T)[]);

    keys.forEach((key) => {
        const o1 = obj1[key];
        const o2 = obj2[key];
        if (deep ? !deepEqual(o1, o2) : o1 !== o2) {
            if (!isDate(o1) || !isDate(o2) || o1.getTime() !== o2.getTime()) {
                diff[key] = o2;
            }
        }
    });

    return diff;
}
export function deepEqual<T extends Record<string, any> = any>(
    a: T,
    b: T,
    ignoreFields?: string[],
    nullVsUndefined?: boolean,
): boolean {
    if (a === b) {
        return true;
    }
    if (isNullOrUndefined(a) !== isNullOrUndefined(b)) {
        return false;
    }

    if (nullVsUndefined) {
        a = removeNullUndefined(a, /*recursive*/ true);
        b = removeNullUndefined(b, /*recursive*/ true);
    }

    const replacer = ignoreFields
        ? (key: string, value: any) => (ignoreFields.includes(key) ? undefined : value)
        : undefined;

    return JSON.stringify(a, replacer) === JSON.stringify(b, replacer);
}
