import { beginBatch, endBatch } from './batching';
import { ObservableEvent } from './event';
import { getNode, globalState, setNodeValue, symbolDelete, symbolGetNode } from './globals';
import { isArray, isEmpty, isFunction, isObject } from './is';
import type { NodeValue, Selector } from './nodeValueTypes';
import { Computed, Observable, ObservableObject, TypeAtPath } from './observableTypes';
import { ObserveEvent } from './observe';

export function isObservable<T = any>(obs: any | Observable<T>): obs is Observable<T> {
    return obs && !!obs[symbolGetNode as any];
}

export function isEvent(obs: any): obs is ObservableEvent {
    return obs && (obs[symbolGetNode as any] as NodeValue)?.isEvent;
}

export function isComputed(obs: any): obs is Observable<Computed<unknown>> {
    return obs && (obs[symbolGetNode as any] as NodeValue)?.isComputed;
}

export function computeSelector<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => void | T),
    e?: ObserveEvent<T>,
    retainObservable?: boolean,
): Observable<T> | T;
export function computeSelector<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => void | T),
    e?: ObserveEvent<T>,
    retainObservable?: false,
): T;
export function computeSelector<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => void | T),
    e?: ObserveEvent<T>,
    retainObservable?: undefined,
): T;
export function computeSelector<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => void | T),
    e?: ObserveEvent<T>,
    retainObservable?: boolean,
): Observable<T> | T {
    let c: T | void | typeof selector = selector;

    if (isFunction(selector)) {
        c = e ? selector(e) : (selector as () => T)();
    }

    return isObservable(c) && !retainObservable ? c.get() : c;
}

export function getObservableIndex(obs: Observable<unknown>): number {
    const node = getNode(obs);
    const n = +node.key! as number;
    return n - n < 1 ? +n : -1;
}

export function lockObservable(obs: Observable<any>, value: boolean) {
    const root = getNode(obs)?.root;
    if (root) {
        root.locked = value;
    }
}
export function setAtPath<T extends object>(
    obj: T,
    path: string[],
    pathTypes: TypeAtPath[],
    value: any,
    fullObj?: T,
    restore?: (path: string[], value: any) => void,
) {
    let o: Record<string, any> = obj;
    let oFull: Record<string, any> | undefined = fullObj;
    if (path.length > 0) {
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (i === path.length - 1) {
                // Don't set if the value is the same. This prevents creating a new key
                // when setting undefined on an object without this key
                if (o[p] !== value) {
                    o[p] = value;
                }
            } else if (o[p] === symbolDelete) {
                // If this was previously deleted, restore it
                if (oFull) {
                    o[p] = oFull[p];
                    restore?.(path.slice(0, i + 1), o[p]);
                }
                break;
            } else if (o[p] === undefined || o[p] === null) {
                o[p] = pathTypes[i] === 'array' ? [] : {};
            }
            o = o[p];
            if (oFull) {
                oFull = oFull[p];
            }
        }
    } else {
        obj = value;
    }

    return obj;
}

export function setInObservableAtPath(obs: Observable<any>, path: string[], value: any, mode: 'assign' | 'set') {
    let o = obs;
    let v = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = (o as any)[p] as Observable<any>;
        v = v[p];
    }

    if (v === symbolDelete) {
        o.delete();
    }
    // Assign if possible, or set otherwise
    else if (mode === 'assign' && 'assign' in o && isObject(o.peek())) {
        (o as ObservableObject<any>).assign(v);
    } else {
        o.set(v);
    }
}

export function mergeIntoObservable<T extends ObservableObject<any> | object>(target: T, ...sources: any[]): T {
    beginBatch();
    globalState.isMerging = true;
    for (let i = 0; i < sources.length; i++) {
        target = _mergeIntoObservable(target, sources[i]);
    }
    globalState.isMerging = false;
    endBatch();
    return target;
}

function _mergeIntoObservable<T extends ObservableObject<any> | object>(target: T, source: any): T {
    const needsSet = isObservable(target);
    const targetValue = needsSet ? target.peek() : target;

    const isTargetArr = isArray(targetValue);
    const isTargetObj = !isTargetArr && isObject(targetValue);

    if (
        (isTargetObj && isObject(source) && !isEmpty(targetValue)) ||
        (isTargetArr && isArray(source) && targetValue.length > 0)
    ) {
        const keys = Object.keys(source) as (keyof T)[];

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const sourceValue = (source as Record<keyof T, any>)[key];
            if (sourceValue === symbolDelete) {
                needsSet && target[key]?.delete ? target[key].delete() : delete (target as Record<string, any>)[key];
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

export function constructObjectWithPath(path: string[], value: any, pathTypes: TypeAtPath[]): object {
    let out;
    if (path.length > 0) {
        let o: Record<string, any> = (out = {});
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            o[p] = i === path.length - 1 ? value : pathTypes[i] === 'array' ? [] : {};
            o = o[p];
        }
    } else {
        out = value;
    }

    return out;
}

export function deconstructObjectWithPath(path: string[], value: any): object {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = o[p];
    }

    return o;
}

export function isObservableValueReady(value: any) {
    return !!value && ((!isObject(value) && !isArray(value)) || !isEmpty(value));
}

export function setSilently(obs: Observable<any>, newValue: any) {
    const node = getNode(obs);
    return setNodeValue(node, newValue).newValue;
}
