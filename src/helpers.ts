import { beginBatch, endBatch } from './batching';
import { getNode, isObservable, setNodeValue, symbolDelete, symbolOpaque } from './globals';
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

const getValueAtPathReducer = (o: any, p: any) => o && o[p];
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
            o[p] = deepMerge(o[p], value);
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
    for (let i = 0; i < sources.length; i++) {
        _mergeIntoObservable(target, sources[i], 0);
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
                (target as any)[key].delete();
            } else {
                const isObj = isObject(sourceValue);
                const isArr = !isObj && isArray(sourceValue);
                const targetChild = (target as Record<string, any>)[key];

                if ((isObj || isArr) && targetChild) {
                    if (levelsDeep > 0 && isEmpty(sourceValue)) {
                        targetChild.set(sourceValue);
                    }
                    _mergeIntoObservable(targetChild, sourceValue, levelsDeep + 1);
                } else {
                    targetChild.set(sourceValue);
                }
            }
        }
    } else if (source !== undefined) {
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

    let result: T = (isArray(target) ? [...target] : { ...target }) as T;

    for (let i = 0; i < sources.length; i++) {
        const obj2 = sources[i];
        if (isPlainObject(obj2) || isArray(obj2)) {
            const objTarget = obj2 as Record<string, any>;
            for (const key in objTarget) {
                if (hasOwnProperty.call(objTarget, key)) {
                    if (
                        objTarget[key] instanceof Object &&
                        !isObservable(objTarget[key]) &&
                        Object.keys(objTarget[key]).length > 0
                    ) {
                        (result as any)[key] = deepMerge(
                            (result as any)[key] || (isArray((objTarget as any)[key]) ? [] : {}),
                            (objTarget as any)[key],
                        );
                    } else {
                        (result as any)[key] = objTarget[key];
                    }
                }
            }
        } else {
            result = obj2;
        }
    }

    return result;
}
