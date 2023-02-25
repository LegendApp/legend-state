import { symbolDelete, symbolGetNode, symbolIsObservable, symbolOpaque } from './globals';
import { isArray, isEmpty, isFunction, isObject } from './is';
import type {
    NodeValue,
    ObservableChild,
    ObservableObject,
    ObservableReadable,
    ObservableWriteable,
    ObserveEvent,
    OpaqueObject,
    Selector,
    TypeAtPath,
} from './observableInterfaces';

export function isObservable(obs: any): obs is ObservableObject {
    return obs && !!obs[symbolIsObservable as any];
}

export function computeSelector<T>(selector: Selector<T>, e?: ObserveEvent<T>) {
    let c = selector as any;
    if (isFunction(c)) {
        c = e ? c(e) : c();
    }

    return isObservable(c) ? c.get() : c;
}

export function getNode(obs: ObservableReadable): NodeValue {
    return (obs as any)[symbolGetNode];
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
export function setAtPath(obj: object, path: string[], pathTypes: TypeAtPath[], value: any) {
    let o = obj;
    if (path.length > 0) {
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (i === path.length - 1) {
                o[p] = value;
            } else if (o[p] === undefined) {
                o[p] = pathTypes[i] === 'array' ? [] : {};
            }
            o = o[p];
        }
    } else {
        obj = value;
    }

    return obj;
}
export function setInObservableAtPath(
    obs: ObservableWriteable,
    path: string[],
    value: any,
    mode: 'assign' | 'set',
    failAssignSilently?: boolean
) {
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
    else if (mode === 'assign' && (o as ObservableObject).assign) {
        if (!failAssignSilently || isObject(o.peek())) {
            (o as ObservableObject).assign(v);
        }
    } else {
        o.set(v);
    }
}
export function mergeIntoObservable<T extends ObservableObject | object>(target: T, ...sources: any[]): T {
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
            const keys: any[] = isTargetArr ? (source as any[]) : Object.keys(source);
            for (let i = 0; i < keys.length; i++) {
                const key = isTargetArr ? i : (keys[i] as string);
                const sourceValue = source[key];
                if (sourceValue === symbolDelete) {
                    needsSet && target[key]?.delete
                        ? target[key].delete()
                        : delete (target as Record<string, any>)[key];
                } else {
                    const isObj = isObject(sourceValue);
                    const isArr = !isObj && isArray(sourceValue);
                    const targetValue = target[key];
                    if ((isObj || isArr) && target[key] && (isObj ? !isEmpty(targetValue) : targetValue.length > 0)) {
                        if (!needsSet && (!target[key] || (isObj ? !isObject(target[key]) : !isArray(target[key])))) {
                            target[key] = isObj ? {} : [];
                        }
                        mergeIntoObservable(target[key], sourceValue);
                    } else {
                        needsSet ? target[key].set(sourceValue) : ((target[key] as any) = sourceValue);
                    }
                }
            }
        } else {
            needsSet ? target.set(source) : ((target as any) = source);
        }
    }

    return target;
}
export function constructObjectWithPath(path: (string | number)[], value: any, pathTypes: TypeAtPath[]): object {
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
export function deconstructObjectWithPath(path: (string | number)[], value: any): object {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = o[p];
    }

    return o;
}
export function isObservableValueReady(value: any) {
    return value && !((isObject(value) && isEmpty(value)) || (isArray(value) && value.length === 0));
}
