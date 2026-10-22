import { isDate, isNullOrUndefined, isObject, isString } from '@legendapp/state';
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
            if (
                deep ||
                !isDate(o1) ||
                !isDate(o2) ||
                Date.prototype.getTime.call(o1) !== Date.prototype.getTime.call(o2)
            ) {
                diff[key] = o2;
            }
        }
    });

    return diff;
}
// Read native state through intrinsics so own properties cannot mask it.
const intrinsic = (prototype: object, key: string) => Object.getOwnPropertyDescriptor(prototype, key)!.get!;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
// The flags getter reads overridable instance properties, so compare each native flag instead.
const regExpFlags = ['hasIndices', 'global', 'ignoreCase', 'multiline', 'dotAll', 'unicode', 'unicodeSets', 'sticky']
    .map((key) => Object.getOwnPropertyDescriptor(RegExp.prototype, key)?.get)
    .filter((get) => !!get) as (() => boolean)[];
const nativeGetters = {
    source: intrinsic(RegExp.prototype, 'source'),
    mapSize: intrinsic(Map.prototype, 'size'),
    setSize: intrinsic(Set.prototype, 'size'),
    buffer: intrinsic(typedArrayPrototype, 'buffer'),
    byteOffset: intrinsic(typedArrayPrototype, 'byteOffset'),
    byteLength: intrinsic(typedArrayPrototype, 'byteLength'),
    viewBuffer: intrinsic(DataView.prototype, 'buffer'),
    viewByteOffset: intrinsic(DataView.prototype, 'byteOffset'),
    viewByteLength: intrinsic(DataView.prototype, 'byteLength'),
};

function getDeepEqualKeys(value: any, ignoreFields?: string[], nullVsUndefined?: boolean): (string | symbol)[] {
    let keys: (string | symbol)[] = Object.keys(value);
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length) {
        keys = keys.concat(symbols.filter((key) => Object.prototype.propertyIsEnumerable.call(value, key)));
    }
    return ignoreFields || nullVsUndefined
        ? keys.filter(
              (key) =>
                  !(typeof key === 'string' && ignoreFields?.includes(key)) &&
                  !(nullVsUndefined && isNullOrUndefined(value[key])),
          )
        : keys;
}

function getDeepEqualArraySymbols(value: any, nullVsUndefined: boolean | undefined): symbol[] {
    const keys = Object.getOwnPropertySymbols(value);
    return keys.length
        ? keys.filter(
              (key) =>
                  Object.prototype.propertyIsEnumerable.call(value, key) &&
                  !(nullVsUndefined && isNullOrUndefined(value[key])),
          )
        : keys;
}

function compareDeepEqualArray(
    a: any,
    b: any,
    ignoreFields: string[] | undefined,
    nullVsUndefined: boolean | undefined,
    depth: number,
): boolean | undefined {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (i in Array.prototype) {
            const ownA = Object.prototype.hasOwnProperty.call(a, i);
            if (ownA !== Object.prototype.hasOwnProperty.call(b, i)) return false;
            if (!ownA) continue;
        }
        const valueA = a[i];
        const valueB = b[i];
        if (valueA !== valueB) {
            const equal = compareDeepEqual(valueA, valueB, ignoreFields, nullVsUndefined, depth + 1);
            if (!equal) return equal;
        }
        if (valueA === undefined && valueB === undefined && i in a !== i in b) return false;
    }
    const symbolsA = getDeepEqualArraySymbols(a, nullVsUndefined);
    const symbolsB = getDeepEqualArraySymbols(b, nullVsUndefined);
    if (symbolsA.length !== symbolsB.length) return false;
    for (const key of symbolsA) {
        if (!Object.prototype.propertyIsEnumerable.call(b, key)) return false;
        const equal = compareDeepEqual(a[key], b[key], ignoreFields, nullVsUndefined, depth + 1);
        if (!equal) return equal;
    }
    return true;
}

function compareDeepEqual(
    a: any,
    b: any,
    ignoreFields: string[] | undefined,
    nullVsUndefined: boolean | undefined,
    depth: number,
): boolean | undefined {
    if (a === b) return true;
    if (typeof a !== 'object' || !a || typeof b !== 'object' || !b) {
        return Number.isNaN(a) && Number.isNaN(b);
    }
    const prototype = Object.getPrototypeOf(a);
    if (prototype !== Object.getPrototypeOf(b)) return false;
    // Bound deep/cyclic graphs without per-node visited-pair allocations.
    if (depth > 100) {
        return undefined;
    }
    let map = false;
    let set = false;
    if (prototype === Array.prototype) {
        return compareDeepEqualArray(a, b, ignoreFields, nullVsUndefined, depth);
    } else if (prototype !== Object.prototype && prototype !== null) {
        if (prototype === Date.prototype) {
            if (!Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b))) return false;
        } else if (prototype === RegExp.prototype) {
            if (
                nativeGetters.source.call(a) !== nativeGetters.source.call(b) ||
                regExpFlags.some((flag) => flag.call(a) !== flag.call(b)) ||
                a.lastIndex !== b.lastIndex
            )
                return false;
        } else if (prototype === Map.prototype || prototype === Set.prototype) {
            map = prototype === Map.prototype;
            set = !map;
            const size = map ? nativeGetters.mapSize : nativeGetters.setSize;
            if (size.call(a) !== size.call(b)) return false;
        } else if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
            if (
                prototype !== DataView.prototype &&
                Object.getPrototypeOf(prototype) !== Object.getPrototypeOf(Uint8Array.prototype)
            )
                return false;
            const view = prototype === DataView.prototype;
            const bytes = (value: any) =>
                new Uint8Array(
                    (view ? nativeGetters.viewBuffer : nativeGetters.buffer).call(value),
                    (view ? nativeGetters.viewByteOffset : nativeGetters.byteOffset).call(value),
                    (view ? nativeGetters.viewByteLength : nativeGetters.byteLength).call(value),
                );
            const bytesA = bytes(a);
            const bytesB = bytes(b);
            if (bytesA.length !== bytesB.length) return false;
            for (let i = 0; i < bytesA.length; i++) {
                if (bytesA[i] !== bytesB[i]) return false;
            }
        } else {
            return false;
        }
    }
    if (map || set) {
        // Native lookup keeps primitive collections linear; structural matching handles cloned entries.
        const keys = map ? Map.prototype.keys : Set.prototype.values;
        const get = Map.prototype.get;
        const unmatched = new Set(keys.call(b));
        for (const key of keys.call(a)) {
            let match = key;
            let equal =
                unmatched.has(key) &&
                (!map ||
                    compareDeepEqual(get.call(a, key), get.call(b, key), ignoreFields, nullVsUndefined, depth + 1));
            if (equal === undefined) return undefined;
            if (!equal) {
                let found = false;
                for (const candidate of unmatched) {
                    equal = compareDeepEqual(key, candidate, ignoreFields, nullVsUndefined, depth + 1);
                    if (equal === undefined) return undefined;
                    if (equal && map) {
                        equal = compareDeepEqual(
                            get.call(a, key),
                            get.call(b, candidate),
                            ignoreFields,
                            nullVsUndefined,
                            depth + 1,
                        );
                        if (equal === undefined) return undefined;
                    }
                    if (equal) {
                        match = candidate;
                        found = true;
                        break;
                    }
                }
                if (!found) return false;
            }
            unmatched.delete(match);
        }
    }
    const keysA = getDeepEqualKeys(a, ignoreFields, nullVsUndefined);
    const keysB = getDeepEqualKeys(b, ignoreFields, nullVsUndefined);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
        const key = keysA[i];
        if (keysA[i] !== keysB[i] && !Object.prototype.propertyIsEnumerable.call(b, key)) return false;
        const valueA = a[key];
        const valueB = b[key];
        if (valueA !== valueB) {
            const equal = compareDeepEqual(valueA, valueB, ignoreFields, nullVsUndefined, depth + 1);
            if (!equal) return equal;
        }
    }
    return true;
}

export function deepEqual<T extends Record<string, any> = any>(
    a: T,
    b: T,
    ignoreFields?: string[],
    nullVsUndefined?: boolean,
): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || !a || typeof b !== 'object' || !b) {
        return Number.isNaN(a) && Number.isNaN(b);
    }

    // Instances with inaccessible state (including proxies/getters) are conservatively different.
    try {
        return compareDeepEqual(a, b, ignoreFields, nullVsUndefined, 0) === true;
    } catch {
        return false;
    }
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

export type StringToDate<T extends Record<string, any>> = {
    [K in keyof T]: T[K] extends string ? string | Date : T[K];
};

const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

export function transformStringifyKeys<TRemote extends Record<string, any>, TLocal extends Record<string, any>>(
    ...keys: TransformStringifyKeys<TRemote, TLocal>
): SyncTransform<TLocal, TRemote> {
    return {
        load: (value: TRemote) => {
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
            (keys as string[]).forEach((key: string) => {
                const keyRemote = isObject(key) ? key.from : key;
                const keyLocal = isObject(key) ? key.to : key;
                const v = (value as any)[keyLocal];
                if (!isNullOrUndefined(v) && !isString(v)) {
                    (value as any)[keyRemote as keyof TLocal] = JSON.stringify(v);
                }
                if (keyLocal !== keyRemote) {
                    delete value[keyLocal];
                }
            });
            return value as unknown as TRemote;
        },
    };
}

export type TransformStringsToDates<T extends {}, Keys extends keyof T> = {
    [K in Keys]: Date | Exclude<T[K], string>;
} & Omit<T, Keys>;

export function transformStringifyDates<
    TRemote extends Record<string, any>,
    TLocal extends Record<string, any> = TRemote,
>(): SyncTransform<TLocal, TRemote>;
export function transformStringifyDates<
    TRemote extends Record<string, any>,
    Keys extends keyof TRemote = keyof TRemote,
>(...args: Keys[]): SyncTransform<TransformStringsToDates<TRemote, Keys>, TRemote>;
export function transformStringifyDates<
    TRemote extends Record<string, any>,
    TLocal extends Record<string, any> = TRemote,
>(...args: (keyof TRemote)[]): SyncTransform<TRemote, TLocal>;
export function transformStringifyDates<
    TRemote extends Record<string, any>,
    TLocal extends Record<string, any> = TRemote,
    Keys extends keyof TLocal = keyof TLocal,
>(...args: Keys[]): SyncTransform<TransformStringsToDates<TLocal, Keys>, TRemote> {
    return {
        load: (value: TRemote) => {
            const keys = args.length > 0 ? args : Object.keys(value);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const keyValue = value[key as keyof TRemote];
                if (isString(keyValue) && keyValue.match(ISO8601)) {
                    (value as any)[key] = new Date(keyValue);
                }
            }

            return value as any;
        },
        save: (value: TransformStringsToDates<TLocal, Keys>) => {
            const keys = args.length > 0 ? args : Object.keys(value);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const keyValue = (value as any)[key];
                if (isDate(keyValue)) {
                    (value as any)[key] = keyValue.toISOString();
                }
            }
            return value as any;
        },
    };
}
