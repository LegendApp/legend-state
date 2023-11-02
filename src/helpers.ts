import type { Observable, ObservableObject, ObservableReadable, ObservableWriteable } from './observableTypes';
import { beginBatch, endBatch } from './batching';
import { getNode, globalState, isObservable, setNodeValue, symbolDelete, symbolGetNode, symbolOpaque } from './globals';
import { isArray, isEmpty, isFunction, isObject } from './is';
import type {
    NodeValue,
    ObservableEvent,
    ObserveEvent,
    OpaqueObject,
    Selector,
    TypeAtPath,
} from './observableInterfaces';

export function isEvent(obs: any): obs is ObservableEvent {
    return obs && (obs[symbolGetNode as any] as NodeValue)?.isEvent;
}

export function computeSelector<T>(selector: Selector<T>, e?: ObserveEvent<T>, retainObservable?: boolean) {
    let c = selector as any;
    if (!isObservable(c) && isFunction(c)) {
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
export function setInObservableAtPath(
    obs: ObservableWriteable,
    path: string[],
    pathTypes: string[],
    value: any,
    mode: 'assign' | 'set',
) {
    let o: Record<string, any> = obs;
    let v = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (!o.peek()[p] && pathTypes[i] === 'array') {
            o[p].set([]);
        }
        o = o[p];
        v = v[p];
    }

    if (v === symbolDelete) {
        (o as Observable).delete();
    }
    // Assign if possible, or set otherwise
    else if (mode === 'assign' && (o as Observable).assign && isObject(o.peek())) {
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
function _mergeIntoObservable<T extends ObservableWriteable<Record<string, any>> | object>(target: T, source: any): T {
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
            o[p] = i === path.length - 1 ? value : pathTypes[i] === 'array' ? [] : {};
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
        o = o ? o[p] : pathTypes[i] === 'array' ? [] : {};
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
