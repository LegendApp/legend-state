import { ObservableHint } from './ObservableHint';
import { getProxy } from './ObservableObject';
import { beginBatch, endBatch, endBatchAndThrow } from './batching';
import { getChildNode, getNode, isObservable, setNodeValue, symbolDelete, symbolOpaque, symbolPlain } from './globals';
import {
    hasOwnProperty,
    isArray,
    isEmpty,
    isFunction,
    isMap,
    isNumber,
    isObject,
    isPlainObject,
    isPrimitive,
    isSet,
} from './is';
import type { Change, GetOptions, ObserveEvent, OpaqueObject, Selector, TypeAtPath } from './observableInterfaces';
import type { ObservableParam } from './observableTypes';

export function computeSelector<T>(
    selector: Selector<T>,
    getOptions?: GetOptions,
    e?: ObserveEvent<T>,
    retainObservable?: boolean,
): T {
    let c = selector as any;
    if (!isObservable(c) && isFunction(c)) {
        c = e ? c(e) : c();
    }

    return isObservable(c) && !retainObservable ? c.get(getOptions) : c;
}

export function getObservableIndex(value$: ObservableParam): number {
    const node = getNode(value$);
    const n = +node.key! as number;
    return isNumber(n) ? n : -1;
}

export function opaqueObject<T extends object>(value: T): OpaqueObject<T> {
    if (process.env.NODE_ENV === 'development') {
        console.warn('[legend-state]: In version 3.0 opaqueObject is moved to ObservableHint.opaque');
    }
    if (value) {
        (value as OpaqueObject<T>)[symbolOpaque] = true;
    }
    return value as OpaqueObject<T>;
}

const getValueAtPathReducer = (o: any, p: any) => o && (isMap(o) ? o.get(p) : o[p]);
export function getValueAtPath(obj: Record<string, any>, path: string[]): any {
    return path.reduce(getValueAtPathReducer, obj);
}

export function setAtPath<T extends object>(
    obj: T,
    path: string[],
    pathTypes: TypeAtPath[],
    value: any,
    mode?: 'set' | 'merge',
    fullObj?: T,
    restore?: (path: string[], value: any) => void,
) {
    let p: string | undefined = undefined;
    let o: Record<string, any> = obj;
    if (path.length > 0) {
        let oFull: Record<string, any> | undefined = fullObj;
        for (let i = 0; i < path.length; i++) {
            p = path[i];
            const map = isMap(o);
            let child = o ? (map ? o.get(p) : o[p]) : undefined;
            const fullChild = oFull ? (map ? oFull.get(p) : oFull[p]) : undefined;
            if (child === symbolDelete) {
                // If this was previously deleted, restore it
                if (oFull) {
                    if (map) {
                        o.set(p, fullChild);
                    } else {
                        o[p] = fullChild;
                    }
                    restore?.(path.slice(0, i + 1), fullChild);
                }
                return obj;
            } else if (child === undefined && value === undefined && i === path.length - 1) {
                // If setting undefined and the key is undefined, no need to initialize or set it
                return obj;
            } else if (i < path.length - 1 && (child === undefined || child === null)) {
                child = initializePathType(pathTypes[i]);
                if (isMap(o)) {
                    o.set(p, child);
                } else {
                    o[p] = child;
                }
            }
            if (i < path.length - 1) {
                o = child;
                if (oFull) {
                    oFull = fullChild;
                }
            }
        }
    }

    // Don't set if the value is the same. This prevents creating a new key
    // when setting undefined on an object without this key
    if (p === undefined) {
        if (mode === 'merge') {
            obj = deepMerge(obj, value);
        } else {
            obj = value;
        }
    } else {
        if (mode === 'merge') {
            if (isMap(o)) {
                o.set(p, deepMerge(o.get(p), value));
            } else {
                o[p] = deepMerge(o[p], value);
            }
        } else if (isMap(o)) {
            o.set(p, value);
        } else {
            o[p] = value;
        }
    }

    return obj;
}
export function mergeIntoObservable<T extends ObservableParam<any>>(target: T, ...sources: any[]): T {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        if (!isObservable(target)) {
            console.error('[legend-state] should only use mergeIntoObservable with observables');
        }
    }
    beginBatch();
    try {
        for (let i = 0; i < sources.length; i++) {
            _mergeIntoObservable(target, sources[i], 0);
        }
    } catch (error) {
        endBatchAndThrow(error);
    }
    endBatch();
    return target;
}
function _mergeIntoObservable<T extends ObservableParam<Record<string, any>>>(
    target: T,
    source: any,
    levelsDeep: number,
): T {
    if (isObservable(source)) {
        source = source.peek();
    }
    const targetValue = target.peek();

    const isTargetArr = isArray(targetValue);
    const isTargetObj = !isTargetArr && isObject(targetValue);

    const isSourceMap = isMap(source);
    const isSourceSet = isSet(source);

    if (isSourceSet && isSet(targetValue)) {
        target.set(new Set([...source, ...targetValue]));
    } else if ((isTargetObj && isObject(source)) || (isTargetArr && targetValue.length > 0)) {
        const keys: string[] = isSourceMap || isSourceSet ? Array.from(source.keys()) : Object.keys(source);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const sourceValue = isSourceSet
                ? key
                : isSourceMap
                  ? (source as Map<any, any>).get(key)
                  : (source as Record<string, any>)[key];
            if (sourceValue === symbolDelete) {
                let targetChild =
                    isMap(targetValue) || key === '__proto__' || key === '_'
                        ? getProxy(getChildNode(getNode(target), key))
                        : (target as Record<string, any>)[key];
                if (isFunction(targetChild) && !isObservable(targetChild))
                    targetChild = getProxy(getChildNode(getNode(target), key));
                targetChild.delete();
            } else {
                const isObj = isObject(sourceValue);
                const isArr = !isObj && isArray(sourceValue);
                let targetChild =
                    isMap(targetValue) || key === '__proto__' || key === '_'
                        ? getProxy(getChildNode(getNode(target), key))
                        : (target as Record<string, any>)[key];
                if (isFunction(targetChild) && !isObservable(targetChild))
                    targetChild = getProxy(getChildNode(getNode(target), key));

                if (
                    (isObj || isArr) &&
                    targetChild &&
                    (key !== '__proto__' || isMap(targetValue) || hasOwnProperty.call(targetValue, key))
                ) {
                    if (isArr) {
                        // Replace dense arrays entirely, merge sparse arrays
                        const sourceArr = sourceValue as any[];
                        const isSparseArray = Object.keys(sourceArr).length < sourceArr.length;

                        if (isSparseArray) {
                            _mergeIntoObservable(targetChild, sourceValue, levelsDeep + 1);
                        } else {
                            targetChild.set(sourceValue);
                        }
                    } else if (levelsDeep > 0 && isEmpty(sourceValue)) {
                        targetChild.set(sourceValue);
                    } else {
                        _mergeIntoObservable(targetChild, sourceValue, levelsDeep + 1);
                    }
                } else {
                    targetChild.set(sourceValue);
                }
            }
        }
    } else if (source !== undefined) {
        const sourcePrototype = isObject(source) ? Object.getPrototypeOf(source) : undefined;
        if (sourcePrototype === Object.prototype || sourcePrototype === null || source instanceof Map) {
            const keys: any[] = isSourceMap ? Array.from(source.keys()) : Object.keys(source);
            const deleted = keys.filter((key) => (isSourceMap ? source.get(key) : source[key]) === symbolDelete);
            if (deleted.length > 0) {
                const isPlain = source[symbolPlain];
                const isOpaque = source[symbolOpaque];
                source = isSourceMap ? new Map(source) : Object.setPrototypeOf({ ...source }, sourcePrototype);
                if (isPlain) {
                    ObservableHint.plain(source);
                }
                if (isOpaque) {
                    ObservableHint.opaque(source);
                }
                for (const key of deleted) {
                    if (isSourceMap) {
                        source.delete(key);
                    } else {
                        delete source[key];
                    }
                }
            }
        }
        target.set(source);
    }

    return target;
}
export function constructObjectWithPath(path: string[], pathTypes: TypeAtPath[], value: any): object {
    let out;
    if (path.length > 0) {
        let o: Record<string, any> = (out = {});
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            o[p] = i === path.length - 1 ? value : initializePathType(pathTypes[i]);
            o = o[p];
        }
    } else {
        out = value;
    }

    return out;
}
export function deconstructObjectWithPath(path: string[], pathTypes: TypeAtPath[], value: any): object {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = o ? o[p] : initializePathType(pathTypes[i]);
    }

    return o;
}
export function isObservableValueReady(value: any) {
    return !!value && ((!isObject(value) && !isArray(value)) || !isEmpty(value));
}

export function setSilently(value$: ObservableParam, newValue: any) {
    const node = getNode(value$);
    return setNodeValue(node, newValue).newValue;
}

export function initializePathType(pathType: TypeAtPath): any {
    switch (pathType) {
        case 'array':
            return [];
        case 'map':
            return new Map();
        case 'set':
            return new Set();
        case 'object':
        default:
            return {};
    }
}
export function applyChange<T extends object>(value: T, change: Change, applyPrevious?: boolean): T {
    const { path, valueAtPath, prevAtPath, pathTypes } = change;
    return setAtPath(value, path as string[], pathTypes, applyPrevious ? prevAtPath : valueAtPath);
}
export function applyChanges<T extends object>(value: T, changes: Change[], applyPrevious?: boolean): T {
    for (let i = 0; i < changes.length; i++) {
        value = applyChange(value, changes[i], applyPrevious);
    }
    return value;
}
export function deepMerge<T>(target: T, ...sources: any[]): T {
    if (isPrimitive(target)) {
        return sources[sources.length - 1];
    }

    if (target instanceof Map) {
        let result: any = new Map(target);
        for (const source of sources) {
            if (result instanceof Map && source instanceof Map) {
                source.forEach((value, key) => {
                    result.set(key, result.has(key) ? deepMerge(result.get(key), value) : value);
                });
            } else {
                result = result instanceof Map ? source : deepMerge(result, source);
            }
        }
        return result;
    }

    let result: T = (isArray(target) ? [...target] : { ...target }) as T;

    for (let i = 0; i < sources.length; i++) {
        const obj2 = sources[i];
        let mergeable = isPlainObject(obj2) || isArray(obj2);
        if (!mergeable) {
            try {
                if (isObject(obj2)) {
                    const prototype = Object.getPrototypeOf(obj2);
                    mergeable = prototype === Object.prototype || prototype === null;
                }
            } catch {
                // Keep sources with inaccessible prototypes atomic.
            }
        }
        if (mergeable) {
            const objTarget = obj2 as Record<string, any>;
            for (const key in objTarget) {
                if (hasOwnProperty.call(objTarget, key)) {
                    const value =
                        objTarget[key] instanceof Object &&
                        !isObservable(objTarget[key]) &&
                        Object.keys(objTarget[key]).length > 0
                            ? deepMerge(
                                  (hasOwnProperty.call(result, key) && (result as any)[key]) ||
                                      (isArray((objTarget as any)[key]) ? [] : {}),
                                  (objTarget as any)[key],
                              )
                            : objTarget[key];
                    Object.defineProperty(result, key, {
                        value,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    });
                }
            }
        } else {
            result = obj2;
        }
    }

    return result;
}
