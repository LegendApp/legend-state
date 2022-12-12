import { symbolDateModified, symbolDelete, symbolGetNode, symbolIsObservable, symbolOpaque } from './globals';
import { isArray, isFunction, isObject } from './is';
import type {
    NodeValue,
    ObservableObject,
    ObservableReadable,
    ObserveEvent,
    OpaqueObject,
    Selector,
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
    (value as OpaqueObject<T>)[symbolOpaque] = true;
    return value as OpaqueObject<T>;
}

export function lockObservable(obs: ObservableReadable, value: boolean) {
    const root = getNode(obs)?.root;
    if (root) {
        root.locked = value;
    }
}
export function mergeIntoObservable<T extends ObservableObject | object>(target: T, ...sources: any[]): T {
    if (!sources.length) return target;

    const source = sources.shift();

    const needsSet = isObservable(target);
    let targetValue = needsSet ? target.peek() : target;

    const isTargetArr = isArray(targetValue);
    const isTargetObj = !isTargetArr && isObject(targetValue);

    if ((isTargetObj && isObject(source)) || (isTargetArr && isArray(source))) {
        const keys: any[] = isTargetArr ? (source as any[]) : Object.keys(source);
        let dateModified = source[symbolDateModified as any];
        for (let i = 0; i < keys.length; i++) {
            const key = isTargetArr ? i : (keys[i] as string);
            const sourceValue = source[key];
            if (sourceValue === symbolDelete) {
                needsSet && target[key]?.delete ? target[key].delete() : delete (target as Record<string, any>)[key];
            } else if (isObject(sourceValue)) {
                if (!needsSet && (!target[key] || !isObject(target[key]))) {
                    target[key] = {};
                }
                mergeIntoObservable(target[key], sourceValue);
                dateModified = Math.max(dateModified || 0, sourceValue[symbolDateModified as any] || 0);
            } else {
                needsSet ? target[key].set(sourceValue) : ((target[key] as any) = sourceValue);
            }
        }
        if (dateModified) {
            needsSet
                ? target[symbolDateModified as any].set(dateModified)
                : (target[symbolDateModified] = dateModified);
        }
    } else {
        needsSet ? target.set(source) : ((target as any) = source);
    }

    return sources.length ? mergeIntoObservable(target, ...sources) : target;
}

export function constructObjectWithPath(path: (string | number)[], value: any): object {
    let out;
    if (path.length > 0) {
        let o = (out = {});
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            o[p] = i === path.length - 1 ? value : {};
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
