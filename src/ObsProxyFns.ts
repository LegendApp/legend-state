import { isFunction, isString } from '@legendapp/tools';
import { symbolDateModified } from './globals';
import { ObsBatcher } from './ObsBatcher';
import {
    EventType,
    ListenerFn,
    ObsListener,
    ObsListenerInfo,
    ObsListenerWithProp,
    ObsProxy,
    ObsProxyChecker,
} from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';
import { state } from './ObsProxyState';

const symbolHasValue = Symbol('__hasValue');

function _obsNotify(target: ObsProxyChecker, listenerInfo: ObsListenerInfo) {
    const info = state.infos.get(target);
    if (info) {
        const listeners = info.listeners;

        const value = target.get();

        // Notify all listeners
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                const listener = listeners[i];
                const prop = (listener as ObsListenerWithProp<any>).prop;
                // Notify this listener if:
                // 1. If prop: The prop matches the path of the change
                // 2. No prop: This target is not being skipped (if getting called during an assign)
                if (prop ? prop === listenerInfo.path[0] : !state.skipNotifyFor.includes(target)) {
                    let propListenerInfo = listenerInfo;
                    if (prop) {
                        propListenerInfo = Object.assign({}, listenerInfo);
                        propListenerInfo.path = listenerInfo.path.slice(1);
                    }
                    ObsBatcher.notify(listener.callback, prop ? value[prop] : value, propListenerInfo);
                }
            }
        }

        // Notify parents
        const parent = info.parent;
        if (parent) {
            const parentListenerInfo = Object.assign({}, listenerInfo);
            parentListenerInfo.path = [info.prop].concat(listenerInfo.path);
            _obsNotify(parent, parentListenerInfo);
        }
    }
}

export function obsNotify<T extends object>(target: ObsProxyChecker<T>, changedValue: T, prevValue: T, path: string[]) {
    _obsNotify(target, { changedValue, prevValue, path });
}

function _listenToObs<T extends object, TProp extends keyof T>(
    callback: ListenerFn<any>,
    prop: TProp,
    target: ObsProxyChecker<T>
) {
    const info = state.infos.get(target);
    if (!info) {
        throw new Error('Can only listen to instances of ObsProxy');
    }
    if (!info.listeners) {
        info.listeners = [];
    }
    const listener = { target, prop, callback } as ObsListenerWithProp<T, TProp>;
    info.listeners.push(listener);
    return listener;
}
export function listenToObs<T extends object>(obs: T, cb: ListenerFn<T>): ObsListener<T>;
export function listenToObs<T extends object, TProp extends keyof T>(
    obs: ObsProxyChecker<T>,
    prop: TProp,
    cb: ListenerFn<T>
): ObsListenerWithProp<T, TProp>;
export function listenToObs<T extends object, TProp extends keyof T>(
    obs: ObsProxyChecker<T>,
    prop: TProp,
    cb?: ListenerFn<T>
): ObsListener<T> | ObsListenerWithProp<T, TProp> {
    if (isFunction(prop)) {
        cb = prop as unknown as ListenerFn<T>;
        prop = undefined;
    }
    return _listenToObs(cb, prop as any, obs as ObsProxy<any>) as any;
}

export function onEquals<T extends object>(obs: ObsProxyChecker<T>, value: T, cb?: (value: T) => void): Promise<T>;
export function onEquals<T extends object, TProp extends keyof T>(
    obs: ObsProxyChecker<T>,
    prop: TProp,
    value: T[TProp],
    cb?: (value?: T) => void
): Promise<T[TProp]>;
export function onEquals<T extends object, TProp extends keyof T>(
    obs: ObsProxyChecker<T>,
    prop: TProp,
    value: T[TProp],
    cb?: (value?: T) => void
): Promise<T[TProp]> {
    if ((!value || isFunction(value)) && !isString(prop)) {
        cb = value as unknown as (value: T) => void;
        value = prop as any;
        prop = undefined;
    }

    return new Promise<any>((resolve) => {
        let isDone = false;
        let listener: ObsListener<T>;
        function check(newValue) {
            // If value param is symbolHasValue, then this is from onHasValue so resolve if newValue is anything but undefined
            if (!isDone && newValue !== undefined && (value === (symbolHasValue as any) || newValue === value)) {
                isDone = true;
                cb?.(newValue);
                resolve(value);
                disposeListener(listener);
            }
            return isDone;
        }
        if (!check(prop ? obs[prop] : obs.get())) {
            listener = listenToObs(obs, prop, check);
        }
    });
}

export function onHasValue<T extends object, TProp extends keyof T>(
    obs: ObsProxyChecker<T>,
    prop: TProp,
    cb?: (value: T) => void
): Promise<T[TProp]> {
    // @ts-ignore
    return onEquals(obs, prop, symbolHasValue as any, cb);
}

export function onTrue<T extends Record<TProp, boolean>, TProp extends keyof T>(
    obs: ObsProxyChecker<T>,
    prop: TProp,
    cb?: () => void
): Promise<void> {
    return onEquals(obs, prop, true as T[TProp], cb) as unknown as Promise<void>;
}

export function getObsModified<T extends ObsProxyChecker>(obs: T) {
    return obs.get?.()?.[symbolDateModified];
}

export function getListeners<T extends ObsProxyChecker>(obs: T) {
    const info = state.infos.get(obs);
    return info?.listeners || [];
}

export function unlisten<T extends ObsProxyChecker>(obs: T, cb: Function) {
    const info = state.infos.get(obs);
    if (info) {
        const i = info.listeners.findIndex((listener) => listener.callback === cb);
        if (i >= 0) {
            const listener = info.listeners[i];
            listener._disposed = true;
            info.listeners.splice(i, 1);
        }
    }
}

const ProxyOnFunctions: Record<EventType, Function> = {
    change: listenToObs,
    equals: onEquals,
    hasValue: onHasValue,
    true: onTrue,
};

export function on(obs: ObsProxyChecker, eventType: EventType, ...args) {
    return ProxyOnFunctions[eventType](obs, ...args);
}
