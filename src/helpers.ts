import { beginBatch, endBatch } from './batching';
import { getNode, symbolDelete, symbolGetNode, symbolOpaque } from './globals';
import { isArray, isEmpty, isFunction, isObject } from './is';
import type {
    NodeValue,
    ObservableChild,
    ObservableComputed,
    ObservableEvent,
    ObservableObject,
    ObservableReadable,
    ObservableWriteable,
    ObserveEvent,
    OpaqueObject,
    Selector,
    TypeAtPath,
} from './observableInterfaces';

export function isObservable(obs: any): obs is ObservableObject {
    return obs && !!obs[symbolGetNode as any];
}

export function isEvent(obs: any): obs is ObservableEvent {
    return obs && (obs[symbolGetNode as any] as NodeValue)?.isEvent;
}

export function isComputed(obs: any): obs is ObservableComputed {
    return obs && (obs[symbolGetNode as any] as NodeValue)?.isComputed;
}

export function computeSelector<T>(selector: Selector<T>, e?: ObserveEvent<T>, retainObservable?: boolean) {
    let c = selector as any;
    if (isFunction(c)) {
        c = e ? c(e) : c();
    }

    return isObservable(c) && !retainObservable ? c.get() : c;
}

export function getObservableIndex(obs: ObservableReadable): number {
    const node = getNode(obs);
    const n = +node.key! as number;
    return n - n < 1 ? +n : -1;
}

export function opaqueObject<T extends object>(value: T): OpaqueObject<T> {
    if (value) {
        (value as OpaqueObject<T>)[symbolOpaque] = true;
    }
    return value as OpaqueObject<T>;
}

export function lockObservable(obs: ObservableReadable, value: boolean) {
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
    let o = obj;
    let oFull = fullObj;
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
export function setInObservableAtPath(obs: ObservableWriteable, path: string[], value: any, mode: 'assign' | 'set') {
    let o = obs;
    let v = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = o[p];
        v = v[p];
    }

    if (v === symbolDelete) {
        (o as ObservableChild).delete();
    }
    // Assign if possible, or set otherwise
    else if (mode === 'assign' && (o as ObservableObject).assign && isObject(o.peek())) {
        (o as ObservableObject).assign(v);
    } else {
        o.set(v);
    }
}
export function mergeIntoObservable<T extends ObservableObject | object>(target: T, ...sources: any[]): T {
    beginBatch();
    const value = _mergeIntoObservable(target, ...sources);
    endBatch();
    return value;
}
function _mergeIntoObservable<T extends ObservableObject | object>(target: T, ...sources: any[]): T {
    if (!sources.length) return target;

    for (let u = 0; u < sources.length; u++) {
        const source = sources[u];

        const needsSet = isObservable(target);
        const targetValue = needsSet ? target.peek() : target;

        const isTargetArr = isArray(targetValue);
        const isTargetObj = !isTargetArr && isObject(targetValue);

        if (
            (isTargetObj && isObject(source) && !isEmpty(targetValue)) ||
            (isTargetArr && isArray(source) && targetValue.length > 0)
        ) {
            for (const key in source) {
                const sourceValue = source[key];
                if (sourceValue === symbolDelete) {
                    needsSet && target[key]?.delete
                        ? target[key].delete()
                        : delete (target as Record<string, any>)[key];
                } else {
                    const isObj = isObject(sourceValue);
                    const isArr = !isObj && isArray(sourceValue);
                    const targetChild = target[key];
                    if ((isObj || isArr) && targetChild && (needsSet || !isEmpty(targetChild))) {
                        if (!needsSet && (!targetChild || (isObj ? !isObject(targetChild) : !isArray(targetChild)))) {
                            target[key] = sourceValue;
                        } else {
                            _mergeIntoObservable(targetChild, sourceValue);
                        }
                    } else {
                        needsSet ? targetChild.set(sourceValue) : ((target[key] as any) = sourceValue);
                    }
                }
            }
        } else if (source !== undefined) {
            needsSet ? target.set(source) : ((target as any) = source);
        }
    }

    return target;
}
export function constructObjectWithPath(path: string[], value: any, pathTypes: TypeAtPath[]): object {
    let out;
    if (path.length > 0) {
        let o = (out = {});
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
