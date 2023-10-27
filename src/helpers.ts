import { beginBatch, endBatch } from './batching';
import { getNode, globalState, setNodeValue, symbolDelete, symbolGetNode, symbolOpaque } from './globals';
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
                o[p] = initializePathType(pathTypes[i]);
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
export function setInObservableAtPath(
    obs: ObservableWriteable,
    path: string[],
    pathTypes: TypeAtPath[],
    value: any,
    mode: 'assign' | 'set',
) {
    let o: Record<string, any> = obs;
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
    globalState.isMerging = true;
    for (let i = 0; i < sources.length; i++) {
        target = _mergeIntoObservable(target, sources[i]);
    }
    globalState.isMerging = false;
    endBatch();
    return target;
}
function _mergeIntoObservable<T extends ObservableObject | object>(target: T, source: any): T {
    const needsSet = isObservable(target);
    const targetValue = needsSet ? target.peek() : target;

    const isTargetArr = isArray(targetValue);
    const isTargetObj = !isTargetArr && isObject(targetValue);

    if (
        (isTargetObj && isObject(source) && !isEmpty(targetValue)) ||
        (isTargetArr && isArray(source) && targetValue.length > 0)
    ) {
        const keys: string[] = Object.keys(source);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const sourceValue = (source as Record<string, any>)[key];
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

export function setSilently(obs: ObservableReadable, newValue: any) {
    const node = getNode(obs);
    return setNodeValue(node, newValue).newValue;
}

export function getPathType(value: any): TypeAtPath {
    return isArray(value) ? 'array' : value instanceof Map ? 'map' : value instanceof Set ? 'set' : 'object';
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

function replacer(_: string, value: any) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else if (value instanceof Set) {
        return {
            dataType: 'Set',
            value: Array.from(value), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

function reviver(_: string, value: any) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        } else if (value.dataType === 'Set') {
            return new Set(value.value);
        }
    }
    return value;
}

export function clone(value: any) {
    return JSON.parse(JSON.stringify(value, replacer), reviver);
}
