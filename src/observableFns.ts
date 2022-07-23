import { isObject, isObjectEmpty } from '@legendapp/tools';
import { isPrimitive, symbolDateModified, symbolShallow } from './globals';
import { observableBatcher } from './observableBatcher';
import {
    ObservableEventType,
    ListenerFn,
    ObservableChecker,
    ObservableListener,
    ObservableListenerInfo,
    OnReturnValue,
    Observable,
    ObservableEvent,
} from './observableInterfaces';
import { state } from './observableState';

const { infos, skipNotifyFor, lastAccessedProxy } = state;

const symbolHasValue = Symbol('__hasValue');

function _notify(target: ObservableChecker, listenerInfo: ObservableListenerInfo, fromChild?: boolean) {
    const info = infos.get(target);
    // Notify this listener if this target is not being skipped (if getting called during an assign)
    if (info && !skipNotifyFor.includes(target)) {
        // Notify all listeners
        if (info.listeners) {
            const value = target.get();
            info.listeners.forEach((listener) => {
                if (
                    !fromChild ||
                    !listener.shallow ||
                    (value === undefined) !== (listenerInfo.prevValue === undefined)
                ) {
                    observableBatcher.notify(listener.callback, value, listenerInfo);
                }
            });
        }

        // Notify parents
        const parent = info.parent;
        if (parent) {
            const parentListenerInfo = Object.assign({}, listenerInfo);
            parentListenerInfo.path = [info.prop as string].concat(listenerInfo.path);
            _notify(parent, parentListenerInfo, /*fromChild*/ true);
        }
    }
}

export function notifyObservable<T>(target: ObservableChecker<T>, changedValue: T, prevValue: T, path: string[]) {
    _notify(target, { changedValue, prevValue, path });
}

export function disposeListener(listener: ObservableListener) {
    if (listener && !listener.isDisposed) {
        listener.isDisposed = true;
        const info = state.infos.get(listener.target);
        if (info.listeners) {
            info.listeners.delete(listener);
        }
    }
}

export function listenToObservableShallow<T>(
    obs: ObservableChecker<T>,
    callback: ListenerFn<T>
): ObservableListener<T> {
    return listenToObservable(obs, callback, /*shallow*/ true);
}

export function listenToObservable<T>(
    obs: ObservableChecker<T>,
    callback: ListenerFn<T>,
    shallow?: boolean
): ObservableListener<T> {
    // Get the stable observable if it's a primitive
    obs = prop(obs);

    const info = infos.get(obs);
    if (!info && process.env.NODE_ENV === 'development') {
        throw new Error('Can only listen to instances of Observable');
    }
    if (!info.listeners) {
        info.listeners = new Set();
    }
    const listener = { target: obs, callback, shallow } as ObservableListener<T>;
    listener.dispose = disposeListener.bind(listener, listener);
    info.listeners.add(listener);
    return listener;
}

export function onEquals<T>(obs: ObservableChecker<T>, value: T, cb?: (value: T) => void): OnReturnValue<T> {
    let listener: ObservableListener<T>;

    const promise = new Promise<any>((resolve) => {
        // Get the stable observable if it's a primitive
        obs = prop(obs);

        let isDone = false;
        function check(newValue) {
            if (
                !isDone &&
                (value === (symbolHasValue as any)
                    ? // If value param is symbolHasValue, then this is from onHasValue so resolve if newValue is anything but undefined or empty object
                      newValue !== undefined && newValue !== null && !isObjectEmpty(newValue)
                    : newValue === value)
            ) {
                isDone = true;
                cb?.(newValue);
                resolve(value);

                disposeListener(listener);
            }
            return isDone;
        }
        if (!check(obs.get())) {
            listener = listenToObservable(obs, check);
        }
    });

    return {
        promise,
        listener,
    };
}

export function onHasValue<T>(obs: ObservableChecker<T>, cb?: (value: T) => void): OnReturnValue<T> {
    return onEquals(obs, symbolHasValue as any, cb);
}

export function onTrue<T extends boolean>(obs: ObservableChecker<T>, cb?: () => void): OnReturnValue<T> {
    return onEquals(obs, true as T, cb);
}

export function unlisten<T extends ObservableChecker>(obs: T, cb: ListenerFn<any>) {
    const info = infos.get(obs);
    if (info) {
        for (const listener of info.listeners) {
            if (listener.callback === cb) {
                info.listeners.delete(listener);
                break;
            }
        }
    }
}

const ObservableOnFunctions: Record<ObservableEventType, Function> = {
    change: listenToObservable,
    changeShallow: listenToObservableShallow,
    equals: onEquals,
    hasValue: onHasValue,
    true: onTrue,
};

export function _on(obs: ObservableChecker, _: any, eventType: ObservableEventType, ...args) {
    return ObservableOnFunctions[eventType](obs, ...args);
}

export function listen<T>(obs: ObservableChecker<T>, eventType: 'change', cb: ListenerFn<T>): ObservableListener<T>;
export function listen<T>(
    obs: ObservableChecker<T>,
    eventType: 'changeShallow',
    cb: ListenerFn<T>
): ObservableListener<T>;
export function listen<T>(
    obs: ObservableChecker<T>,
    eventType: 'equals',
    value: T,
    cb?: (value?: T) => void
): { listener: ObservableListener<T>; promise: Promise<T> };
export function listen<T>(
    obs: ObservableChecker<T>,
    eventType: 'hasValue',
    cb?: (value?: T) => void
): { listener: ObservableListener<T>; promise: Promise<T> };
export function listen<T>(
    obs: ObservableChecker<T>,
    eventType: 'true',
    cb?: (value?: T) => void
): { listener: ObservableListener<T>; promise: Promise<T> };
export function listen<T>(
    obs: ObservableChecker<T>,
    eventType: ObservableEventType,
    cb?: (value?: T) => void
): ObservableListener<T> | { listener: ObservableListener<T>; promise: Promise<T> };
export function listen<T>(obs: ObservableChecker<T>, eventType: ObservableEventType, ...args) {
    return ObservableOnFunctions[eventType](obs, ...args);
}

export function observableProp(obs: ObservableChecker, _: any, prop: string | number) {
    state.inProp = true;
    return obs[prop];
}

export function getObservableFromPrimitive(primitive: any) {
    if (lastAccessedProxy) {
        const { proxy, prop } = lastAccessedProxy;
        const info = infos.get(proxy);
        // Make sure the primitive being accessed is the one from lastAccessedProxy
        // == instead of === because some platforms like React native fail here on ===
        if (info && info.target[prop] == primitive) {
            return proxy.prop(prop);
        }
    }
}

export function prop(obs: ObservableChecker) {
    if (isPrimitive(obs)) {
        obs = getObservableFromPrimitive(obs);
    }
    return obs;
}

export function shallow(obs: ObservableChecker) {
    return obs[symbolShallow as any];
}

export function isObservable(obj: any): obj is Observable {
    return infos.has(obj);
}

export function isObservableEvent(obj: any): obj is ObservableEvent {
    return isObject(obj) && obj.hasOwnProperty('fire') && obj.hasOwnProperty('on');
}

export function merge(target: any, ...sources: any[]) {
    if (!sources.length) return target;
    const source = sources.shift();

    const needsSet = isObservable(target);
    const targetValue = needsSet ? target.get() : target;

    if (isObject(targetValue) && isObject(source)) {
        if (source[symbolDateModified as any]) {
            if (needsSet) {
                target.set(symbolDateModified, source[symbolDateModified as any]);
            } else {
                target[symbolDateModified as any] = source[symbolDateModified as any];
            }
        }
        for (const key in source) {
            if (isObject(source[key])) {
                if (!isObject(targetValue[key])) {
                    if (needsSet) {
                        target.set(key, {});
                    } else {
                        target[key] = {};
                    }
                }
                if (!targetValue[key]) {
                    if (needsSet) {
                        target.assign({ [key]: {} });
                    } else {
                        Object.assign(target, { [key]: {} });
                    }
                }
                merge(target[key], source[key]);
            } else {
                if (isObservable(target)) {
                    target.assign({ [key]: source[key] });
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
    }
    return merge(target, ...sources);
}
