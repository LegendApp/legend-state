import { isArray, isDate, isNullOrUndefined, isNumber, isObject, isString } from '@legendapp/state';
import type { SyncTransform, SyncTransformMethod } from './syncTypes';

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

export function combineTransforms<T, T2>(...transforms: Partial<SyncTransform<T2, T>>[]): SyncTransform<T2, T> {
    return {
        load: (value: T, method: SyncTransformMethod) => {
            let inValue = value as any;
            transforms.forEach((transform) => {
                if (transform.load) {
                    inValue = transform.load(inValue, method);
                }
            });
            return inValue;
        },
        save: (value: T2) => {
            let outValue = value as any;
            transforms.forEach((transform) => {
                if (transform.save) {
                    outValue = transform.save(outValue);
                }
            });
            return outValue;
        },
    };
}

export interface TransformStringifyOptions {
    stringifyIf?: {
        number?: boolean;
        object?: boolean;
        array?: boolean;
        date?: boolean;
    };
    filterArrays?: boolean;
}
export type TransformStringifyKeys<TRemote, TLocal> = (keyof TRemote | { from: keyof TRemote; to: keyof TLocal })[];

const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
export function transformStringify<TRemote extends Record<string, any>, TLocal extends Record<string, any>>(
    { stringifyIf, filterArrays }: TransformStringifyOptions,
    ...keys: TransformStringifyKeys<TRemote, TLocal>
): SyncTransform<TLocal, TRemote> {
    return {
        load: (value: TRemote) => {
            if (stringifyIf?.date) {
                const keys = Object.keys(value);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const keyValue = value[key];
                    if (isString(keyValue) && keyValue.match(ISO8601)) {
                        (value as any)[key] = new Date(keyValue);
                    }
                }
            }
            (keys as string[]).forEach((key) => {
                const keyRemote = isObject(key) ? key.from : key;
                const keyLocal = isObject(key) ? key.to : key;
                const v = value[keyRemote];
                if (!isNullOrUndefined(v)) {
                    value[keyLocal as keyof TRemote] = isString(v) ? JSON.parse(v as string) : v;
                }
                if (keyLocal !== keyRemote) {
                    delete value[keyRemote];
                }
            });
            return value as unknown as TLocal;
        },
        save: (value: TLocal) => {
            if (stringifyIf?.date) {
                const keys = Object.keys(value);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const keyValue = value[key];
                    if (isDate(keyValue)) {
                        (value as any)[key] = keyValue.toISOString();
                    }
                }
            }
            (keys as string[]).forEach((key: string) => {
                const keyRemote = isObject(key) ? key.from : key;
                const keyLocal = isObject(key) ? key.to : key;
                let v = (value as any)[keyLocal];
                if (!isNullOrUndefined(v)) {
                    if (filterArrays && isArray(v)) {
                        v = v.filter((val) => !isNullOrUndefined(val));
                    }
                    if (stringifyIf) {
                        value[keyRemote as keyof TLocal] =
                            (stringifyIf.number && isNumber(v)) ||
                            (stringifyIf.object && isObject(v)) ||
                            (stringifyIf.array && isArray(v))
                                ? JSON.stringify(v)
                                : v;
                    }
                }
                if (keyLocal !== keyRemote) {
                    delete value[keyLocal];
                }
            });
            return value as unknown as TRemote;
        },
    };
}
