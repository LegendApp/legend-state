import { ArrayValue, RecordValue, isArray, isObject, isString, symbolDelete } from '@legendapp/state';
import type { SyncTransform } from '@legendapp/state/sync';

let validateMap: (map: Record<string, any>) => void;
export function transformObjectFields(dataIn: Record<string, any>, map: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
        validateMap(map);
    }
    let ret = dataIn;
    if (dataIn) {
        if ((dataIn as unknown) === symbolDelete) return dataIn;
        if (isString(dataIn)) {
            return map[dataIn];
        }

        ret = {};

        const dict = Object.keys(map).length === 1 && map['_dict'];

        for (const key in dataIn) {
            let v = dataIn[key];

            if (dict) {
                ret[key] = transformObjectFields(v, dict);
            } else {
                const mapped = map[key];
                if (mapped === undefined) {
                    // Don't transform dateModified if user doesn't want it
                    if (key !== '@') {
                        ret[key] = v;
                        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                            console.error('A fatal field transformation error has occurred', key, dataIn, map);
                        }
                    }
                } else if (mapped !== null) {
                    if (v !== undefined && v !== null) {
                        if (map[key + '_val']) {
                            const mapChild = map[key + '_val'];
                            if (isArray(v)) {
                                v = v.map((vChild) => mapChild[vChild]);
                            } else {
                                v = mapChild[v];
                            }
                        } else if (map[key + '_arr'] && isArray(v)) {
                            const mapChild = map[key + '_arr'];
                            v = v.map((vChild) => transformObjectFields(vChild, mapChild));
                        } else if (isObject(v)) {
                            if (map[key + '_obj']) {
                                v = transformObjectFields(v, map[key + '_obj']);
                            } else if (map[key + '_dict']) {
                                const mapChild = map[key + '_dict'];
                                const out: Record<string, any> = {};
                                for (const keyChild in v) {
                                    out[keyChild] = transformObjectFields(v[keyChild], mapChild);
                                }
                                v = out;
                            }
                        }
                    }
                    ret[mapped] = v;
                }
            }
        }
    }

    return ret;
}
const invertedMaps = new WeakMap();
export function invertFieldMap(obj: Record<string, any>) {
    const existing = invertedMaps.get(obj);
    if (existing) return existing;

    const target: Record<string, any> = {} as any;

    for (const key in obj) {
        const val = obj[key];
        if (key === '_dict') {
            target[key] = invertFieldMap(val);
        } else if (key.endsWith('_obj') || key.endsWith('_dict') || key.endsWith('_arr') || key.endsWith('_val')) {
            const keyMapped = obj[key.replace(/_obj|_dict|_arr|_val$/, '')];
            const suffix = key.match(/_obj|_dict|_arr|_val$/)![0];
            target[keyMapped + suffix] = invertFieldMap(val);
        } else if (typeof val === 'string') {
            target[val] = key;
        }
    }
    invertedMaps.set(obj, target);

    return target;
}
export const fieldTransformToTransform = <T extends object>(fieldTransform: FieldTransforms<T>): SyncTransform<T> => ({
    load(value) {
        const inverted = invertFieldMap(fieldTransform);
        return transformObjectFields(value, inverted);
    },
    save(value) {
        return transformObjectFields(value, fieldTransform);
    },
});
if (process.env.NODE_ENV === 'development') {
    validateMap = function (record: Record<string, any>) {
        const values = Object.values(record).filter((value) => {
            if (isObject(value)) {
                validateMap(value);
            } else {
                return isString(value);
            }
        });

        const uniques = Array.from(new Set(values));
        if (values.length !== uniques.length) {
            console.error('Field transform map has duplicate values', record, values.length, uniques.length);
        }
        return record;
    };
}
export declare type FieldTransforms<T> =
    | (T extends Record<string, Record<string, any>> ? { _dict: FieldTransformsInner<RecordValue<T>> } : never)
    | FieldTransformsInner<T>;
export declare type FieldTransformsInner<T> = {
    [K in keyof T]: string;
} & (
    | {
          [K in keyof ObjectKeys<T> as `${K}_obj`]?: FieldTransforms<T[K]>;
      }
    | {
          [K in keyof DictKeys<T> as `${K}_dict`]?: FieldTransforms<RecordValue<T[K]>>;
      }
) & {
        [K in keyof ArrayKeys<T> as `${K}_arr`]?: FieldTransforms<ArrayValue<T[K]>>;
    } & {
        [K in keyof ArrayKeys<T> as `${K}_val`]?: FieldTransforms<ArrayValue<T[K]>>;
    };
// This converts the state object's shape to the field transformer's shape
// TODO: FieldTransformer and this shape can likely be refactored to be simpler
declare type ObjectKeys<T> = Pick<
    T,
    {
        [K in keyof T]-?: K extends string
            ? T[K] extends Record<string, any>
                ? T[K] extends any[]
                    ? never
                    : K
                : never
            : never;
    }[keyof T]
>;
declare type DictKeys<T> = Pick<
    T,
    {
        [K in keyof T]-?: K extends string ? (T[K] extends Record<string, Record<string, any>> ? K : never) : never;
    }[keyof T]
>;
declare type ArrayKeys<T> = Pick<
    T,
    {
        [K in keyof T]-?: K extends string | number ? (T[K] extends any[] ? K : never) : never;
    }[keyof T]
>;
