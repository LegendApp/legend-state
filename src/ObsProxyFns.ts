import { isArray, isFunction, isString } from '@legendapp/tools';
import { symbolDateModified } from './globals';
import { ObsBatcher } from './ObsBatcher';
import {
    ListenerFn,
    ObsListener,
    ObsListenerInfo,
    ObsListenerWithProp,
    ObsProxy,
    ObsProxyUnsafe,
    ProxyValue,
} from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';
import { state } from './ObsProxyState';

const symbolHasValue = Symbol('__hasValue');

function _obsNotify(target: ObsProxyUnsafe, listenerInfo: ObsListenerInfo) {
    const info = state.infos.get(target);
    if (info) {
        const listeners = info.listeners;

        const value = target.get();

        // Notify all listeners
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                const listener = listeners[i];
                const prop = (listener as ObsListenerWithProp<any>).prop;
                if (!prop || prop === listenerInfo.path[0]) {
                    ObsBatcher.notify(listener.callback, prop ? value[prop] : value, listenerInfo);
                }
            }
        }

        // Notify parents
        const parent = info.parent;
        if (parent) {
            listenerInfo.path.splice(0, 0, info.prop);
            _obsNotify(parent, listenerInfo);
        }
    }
}

export function obsNotify<T extends ObsProxy | ObsProxyUnsafe>(
    target: T,
    changedValue: ProxyValue<T>,
    prevValue: ProxyValue<T>,
    path: string[]
) {
    _obsNotify(target, { changedValue, prevValue, path });
}

function _listenToObs<T extends ObsProxy | ObsProxyUnsafe, TProp extends keyof T>(
    callback: ListenerFn<any>,
    prop: TProp,
    target: ObsProxyUnsafe<T>
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
export function listenToObs<T extends ObsProxy | ObsProxyUnsafe>(obs: T, cb: ListenerFn<T>): ObsListener<T>;
export function listenToObs<T extends ObsProxy | ObsProxyUnsafe>(obs: T, cb: ListenerFn<T>): ObsListener<T>[];
export function listenToObs<T extends ObsProxy | ObsProxyUnsafe, TProp extends keyof T>(
    obs: T,
    prop: TProp,
    cb: ListenerFn<T>
): ObsListenerWithProp<T, TProp>;
export function listenToObs<T extends ObsProxy | ObsProxyUnsafe, TProp extends keyof T>(
    obs: T[],
    prop: TProp,
    cb: ListenerFn<T>
): ObsListenerWithProp<T, TProp>[];
export function listenToObs<T extends ObsProxy | ObsProxyUnsafe, TProp extends keyof T>(
    args: T[],
    prop: TProp,
    cb?: ListenerFn<T>
): ObsListener<T> | ObsListener<T>[] | ObsListenerWithProp<T, TProp> | ObsListenerWithProp<T, TProp>[] {
    if (isFunction(prop)) {
        cb = prop as unknown as ListenerFn<T>;
        prop = undefined;
    }
    return isArray(args) ? args.map(_listenToObs.bind(this, prop, cb)) : (_listenToObs(cb, prop as any, args) as any);
}

export function onValue<T extends ObsProxy | ObsProxyUnsafe>(target: T, value: T, cb?: (value: T) => void): Promise<T>;
export function onValue<T extends ObsProxy | ObsProxyUnsafe, TProp extends keyof T>(
    obs: T,
    prop: TProp,
    value: T[TProp],
    cb?: (value: T) => void
): Promise<T[TProp]>;
export function onValue<T extends ObsProxy | ObsProxyUnsafe, TProp extends keyof T>(
    obs: T,
    prop: TProp,
    value: T,
    cb?: (value: T) => void
): Promise<T[TProp]> {
    if ((!value || isFunction(value)) && !isString(prop)) {
        cb = value as unknown as (value: T) => void;
        value = prop as unknown as T;
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

export function onHasValue<T extends ObsProxy | ObsProxyUnsafe, TProp extends keyof T>(
    obs: T,
    prop: TProp,
    cb?: (value: T) => void
): Promise<T[TProp]> {
    return onValue(obs, prop, symbolHasValue as any, cb);
}

export function onTrue<
    T extends ObsProxy<Record<TProp, boolean>> | ObsProxyUnsafe<Record<TProp, boolean>>,
    TProp extends keyof T
>(obs: T, prop: TProp, cb?: () => void): Promise<void> {
    return onValue(obs, prop, true as any, cb) as unknown as Promise<void>;
}

export function getObsModified(obs: ObsProxyUnsafe) {
    return obs.get()[symbolDateModified];
}
