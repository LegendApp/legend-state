import { isArray, isObject, isString } from '@legendapp/tools';
import { obsProxy } from 'src/ObsProxy';

export function transformPath(path: string[], map: Record<string, any>) {
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

export function transformObject(dataIn: Record<string, any>, map: Record<string, any>, id?: string) {
    let ret: any = {};
    if (dataIn) {
        if (isArray(dataIn)) {
            if (process.env.NODE_ENV === 'development') debugger;
            ret = dataIn.map((d) => map[d]);
        } else if (isString(dataIn)) {
            ret = map[dataIn];
        } else {
            Object.keys(dataIn).forEach((key) => {
                if (key === '__obj' || key === '__dict' || key === '__arr' || key === '_id') return;
                let v = dataIn[key];

                if (key === '@') {
                    ret[key] = v;
                } else {
                    if (isObject(map.__dict)) {
                        ret[key] = {};
                        if (v) {
                            ret[key] = transformObject(v, map.__dict, key);
                        }
                    } else {
                        if (process.env.NODE_ENV === 'development' && map[key] === undefined && !map['*']) {
                            console.error('A fatal field transformation error has occurred', key, map);
                            debugger;
                        }

                        const mapped = map[key] ?? key;
                        if (mapped) {
                            const k = mapped._;
                            if (mapped.__dict) {
                                if (process.env.NODE_ENV === 'development' && !isString(k)) debugger;
                                ret[k] = {};
                                if (v) {
                                    Object.keys(v).forEach((dictKey) => {
                                        if (!isString(dictKey)) debugger;
                                        ret[k][dictKey] = transformObject(v[dictKey], map[key], key);
                                    });
                                }
                            } else if (mapped.__obj) {
                                if (process.env.NODE_ENV === 'development' && !isString(k)) debugger;
                                ret[k] = isObject(v) ? transformObject(v, map[key], key) : v;
                            } else if (mapped.__arr) {
                                if (process.env.NODE_ENV === 'development' && !isString(k)) debugger;
                                ret[k] = v.map((v2) => transformObject(v2, map[key], key));
                            } else if (mapped.__val) {
                                if (process.env.NODE_ENV === 'development' && !isString(k)) debugger;
                                if (process.env.NODE_ENV === 'development' && !isString(v)) debugger;
                                ret[k] = mapped.__val[v];
                            } else {
                                if (!isString(mapped)) debugger;
                                ret[mapped] = v;
                            }
                        }
                    }
                }
                if (process.env.NODE_ENV === 'development' && ret['[object Object]']) debugger;
                // console.log(Object.keys(ret));
                // console.log('');
            });
            if (id) {
                if (map._id) {
                    ret[map._id] = id;
                }
                if (map.id) {
                    ret[map.id] = id;
                }
            }
        }
    }

    if (process.env.NODE_ENV === 'development' && ret['[object Object]']) debugger;

    return ret;
}

export function invertObject(obj: Record<string, any>) {
    const target: Record<string, any> = {} as any;

    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (process.env.NODE_ENV === 'development' && target[val]) debugger;
        if (key !== '_') {
            if (key === '__obj' || key === '__dict' || key === '__arr' || key === '__val') {
                if (isObject(val)) {
                    target[key] = invertObject(val);
                } else {
                    target[key] = val;
                }
            } else if (typeof val === 'string') {
                target[val] = key;
            } else if (isObject(val)) {
                const prop =
                    (val.__obj && '__obj') ||
                    (val.__dict && '__dict') ||
                    (val.__arr && '__arr') ||
                    (val.__val && '__val');
                if (prop) {
                    const k = val._;
                    target[k] = Object.assign(invertObject(val), { _: key });
                }
            }
        }
    });

    return target;
}

export function isObjectEmpty(obj: object) {
    return obj && Object.keys(obj).length === 0;
}
