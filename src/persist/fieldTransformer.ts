import {
    constructObjectWithPath,
    deconstructObjectWithPath,
    FieldTransforms,
    isObject,
    isString,
    symbolDateModified,
    symbolDelete,
    TypeAtPath,
} from '@legendapp/state';

let validateMap: (map: Record<string, any>) => void;

export function transformPath(path: string[], map: Record<string, any>): string[] {
    const data: Record<string, any> = {};
    let d = data;
    for (let i = 0; i < path.length; i++) {
        d = d[path[i]] = i === path.length - 1 ? null : {};
    }
    let value = transformObject(data, map);
    const pathOut = [];
    for (let i = 0; i < path.length; i++) {
        const key = Object.keys(value)[0];
        pathOut.push(key);
        value = value[key];
    }
    return pathOut;
}

export function transformObject(dataIn: Record<string, any>, map: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
        validateMap(map);
    }
    // Note: If changing this, change it in IndexedDB preloader
    let ret = dataIn;
    if (dataIn) {
        if ((dataIn as unknown) === symbolDelete) return dataIn;

        ret = {};

        const dict = Object.keys(map).length === 1 && map['_dict'];

        const dateModified = dataIn[symbolDateModified as any];
        if (dateModified) {
            ret[symbolDateModified as any] = dateModified;
        }
        Object.keys(dataIn).forEach((key) => {
            if (ret[key] !== undefined) return;

            let v = dataIn[key];

            if (dict) {
                ret[key] = transformObject(v, dict);
            } else {
                const mapped = map[key];
                if (mapped === undefined) {
                    if (
                        (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
                        map[key] === undefined
                    ) {
                        console.error('A fatal field transformation error has occurred', key, dataIn, map);
                        ret[key] = v;
                    }
                } else if (mapped !== null) {
                    if (v !== undefined && v !== null) {
                        if (map[key + '_val']) {
                            const valMap = map[key + '_val'];
                            v = valMap[key];
                        } else if (map[key + '_obj']) {
                            v = transformObject(v, map[key + '_obj']);
                        } else if (map[key + '_dict']) {
                            const mapChild = map[key + '_dict'];
                            const out = {};
                            const dateModifiedChild = dataIn[symbolDateModified as any];
                            if (dateModifiedChild) {
                                out[symbolDateModified as any] = dateModifiedChild;
                            }
                            Object.keys(v).forEach((keyChild) => {
                                out[keyChild] = transformObject(v[keyChild], mapChild);
                            });
                            v = out;
                        } else if (map[key + '_arr']) {
                            const mapChild = map[key + '_arr'];
                            v = v.map((vChild) => transformObject(vChild, mapChild));
                        }
                    }
                    ret[mapped] = v;
                }
            }
        });
    }

    return ret;
}

export function transformObjectWithPath(
    obj: object,
    path: (string | number)[],
    pathTypes: TypeAtPath[],
    fieldTransforms: FieldTransforms<any>
) {
    const constructed = constructObjectWithPath(path, obj, pathTypes);
    const transformed = transformObject(constructed, fieldTransforms);
    const transformedPath = transformPath(path as string[], fieldTransforms);
    return { path: transformedPath, obj: deconstructObjectWithPath(transformedPath, transformed) };
}

const invertedMaps = new WeakMap();

export function invertFieldMap(obj: Record<string, any>) {
    // Note: If changing this, change it in IndexedDB preloader
    const existing = invertedMaps.get(obj);
    if (existing) return existing;

    const target: Record<string, any> = {} as any;

    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (key === '_dict') {
            target[key] = invertFieldMap(val);
        } else if (key.endsWith('_obj') || key.endsWith('_dict') || key.endsWith('_arr')) {
            const keyMapped = obj[key.replace(/_obj|_dict|_arr$/, '')];
            const suffix = key.match(/_obj|_dict|_arr$/)[0];
            target[keyMapped + suffix] = invertFieldMap(val);
        } else if (typeof val === 'string') {
            target[val] = key;
        }
    });
    invertedMaps.set(obj, target);

    return target;
}

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
