import { beginBatch, endBatch } from './batching';
import { getNode, globalState, isObservable, setNodeValue, symbolDelete, symbolOpaque } from './globals';
import { isArray, isEmpty, isFunction, isMap, isNumber, isObject } from './is';
import type { Change, ObserveEvent, OpaqueObject, Selector, TypeAtPath } from './observableInterfaces';
import type { Observable, ObservableParam } from './observableTypes';

export function computeSelector<T>(selector: Selector<T>, e?: ObserveEvent<T>, retainObservable?: boolean): T {
    let c = selector as any;
    if (!isObservable(c) && isFunction(c)) {
        c = e ? c(e) : c();
    }

    return isObservable(c) && !retainObservable ? c.get() : c;
}

export function getObservableIndex(value$: ObservableParam): number {
    const node = getNode(value$);
    const n = +node.key! as number;
    return isNumber(n) ? n : -1;
}

export function opaqueObject<T extends object>(value: T): OpaqueObject<T> {
    if (value) {
        (value as OpaqueObject<T>)[symbolOpaque] = true;
    }
    return value as OpaqueObject<T>;
}

export function getValueAtPath(obj: Record<string, any>, path: string[]): any {
    let o: Record<string, any> = obj;
    for (let i = 0; o && i < path.length; i++) {
        const p = path[i];
        o = o[p];
    }

    return o;
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
    let o: Record<string, any> = obj;
    let oFull: Record<string, any> | undefined = fullObj;
    let p: string | undefined = undefined;
    if (path.length > 0) {
        for (let i = 0; i < path.length; i++) {
            p = path[i];
            if (o[p] === symbolDelete) {
                // If this was previously deleted, restore it
                if (oFull) {
                    o[p] = oFull[p];
                    restore?.(path.slice(0, i + 1), o[p]);
                }
                return obj;
            } else if (o[p] === undefined && value === undefined && i === path.length - 1) {
                // If setting undefined and the key is undefined, no need to initialize or set it
                return obj;
            } else if (o[p] === undefined || o[p] === null) {
                o[p] = initializePathType(pathTypes[i]);
            }
            if (i < path.length - 1) {
                o = o[p];
                if (oFull) {
                    oFull = oFull[p];
                }
            }
        }
    }

    // Don't set if the value is the same. This prevents creating a new key
    // when setting undefined on an object without this key
    if (p === undefined) {
        if (mode === 'merge') {
            obj = _mergeIntoObservable(obj, value);
        } else {
            obj = value;
        }
    } else {
        if (mode === 'merge') {
            o[p] = _mergeIntoObservable(o[p], value);
        } else if (isMap(o)) {
            o.set(p, value);
        } else {
            o[p] = value;
        }
    }

    return obj;
}
export function setInObservableAtPath(
    value$: ObservableParam,
    path: string[],
    pathTypes: TypeAtPath[],
    value: any,
    mode: 'assign' | 'set' | 'merge',
) {
    let o: Record<string, any> = value$;
    let v = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (!o.peek()[p]) {
            o[p].set(initializePathType(pathTypes[i]));
        }
        o = o[p];
        v = v[p];
    }

    if (v === symbolDelete) {
        (o as Observable).delete();
    }
    // Assign if possible, or set otherwise
    else if (mode === 'assign' && (o as Observable).assign && isObject(o.peek())) {
        (o as Observable<{}>).assign(v);
    } else if (mode === 'merge') {
        mergeIntoObservable(o, v);
    } else {
        o.set(v);
    }
}
export function mergeIntoObservable<T extends ObservableParam<Record<string, any>> | object>(
    target: T,
    ...sources: any[]
): T {
    beginBatch();
    globalState.isMerging = true;
    for (let i = 0; i < sources.length; i++) {
        target = _mergeIntoObservable(target, sources[i]);
    }
    globalState.isMerging = false;
    endBatch();
    return target;
}
function _mergeIntoObservable<T extends ObservableParam<Record<string, any>> | object>(target: T, source: any): T {
    if (isObservable(source)) {
        source = source.peek();
    }
    const needsSet = isObservable(target);
    const targetValue = needsSet ? target.peek() : target;

    const isTargetArr = isArray(targetValue);
    const isTargetObj = !isTargetArr && isObject(targetValue);

    if ((isTargetObj && isObject(source) && !isEmpty(targetValue)) || (isTargetArr && targetValue.length > 0)) {
        const keys: string[] = Object.keys(source);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const sourceValue = (source as Record<string, any>)[key];
            if (sourceValue === symbolDelete) {
                needsSet && (target as any)[key]?.delete
                    ? (target as any)[key].delete()
                    : delete (target as Record<string, any>)[key];
            } else {
                const isObj = isObject(sourceValue);
                const isArr = !isObj && isArray(sourceValue);
                const targetChild = (target as Record<string, any>)[key];
                if ((isObj || isArr) && targetChild && (needsSet || !isEmpty(targetChild))) {
                    if (!needsSet && (!targetChild || (isObj ? !isObject(targetChild) : !isArray(targetChild)))) {
                        (target as Record<string, any>)[key] = sourceValue;
                    } else {
                        _mergeIntoObservable(targetChild, sourceValue);
                    }
                } else {
                    needsSet
                        ? targetChild.set(sourceValue)
                        : (((target as Record<string, any>)[key] as any) = sourceValue);
                }
            }
        }
    } else if (source !== undefined) {
        needsSet ? target.set(source) : ((target as any) = source);
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
        case 'object':
            return {};
        case 'map':
            return new Map();
        case 'set':
            return new Set();
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
