import { isArray, isFunction, isString } from '@legendapp/tools';
import { symbolDateModified } from './globals';
import { ObsBatcher } from './ObsBatcher';
import { ListenerFn, ObsListener, ObsListenerInfo, ObsProxy } from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';
import { state } from './ObsProxyState';

function _obsNotify(target: ObsProxy, listenerInfo: ObsListenerInfo) {
    const info = state.infos.get(target);
    if (info) {
        const listeners = info.listeners;

        const value = target.value;

        // Notify all listeners
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                ObsBatcher.notify(listeners[i].callback, value, listenerInfo);
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

export function obsNotify<T extends object>(target: ObsProxy<T>, changedValue: T, prevValue: T, path: string[]) {
    _obsNotify(target, { changedValue, prevValue, path });
}

function _listenToObs<T extends object, TKey extends keyof T>(callback: ListenerFn<T>, key: TKey, target: ObsProxy<T>) {
    const info = state.infos.get(target);
    if (!info) debugger;
    if (!info.listeners) {
        info.listeners = [];
    }
    const listener = { target, callback } as ObsListener<T>;
    info.listeners.push(listener);
    return listener;
}
export function listenToObs<T extends object>(obs: ObsProxy<T>, cb: ListenerFn<T>): ObsListener<T>;
export function listenToObs<T extends object>(obs: ObsProxy<T> | ObsProxy<T>[], cb: ListenerFn<T>): ObsListener<T>[];
export function listenToObs<T extends object, TKey extends keyof T>(
    obs: ObsProxy<T>,
    key: TKey,
    cb: ListenerFn<T>
): ObsListener<T>;
export function listenToObs<T extends object, TKey extends keyof T>(
    obs: ObsProxy<T> | ObsProxy<T>[],
    key: TKey,
    cb: ListenerFn<T>
): ObsListener<T>[];
export function listenToObs<T extends object, TKey extends keyof T>(
    args: ObsProxy<T> | ObsProxy<T>[],
    key: TKey,
    cb?: ListenerFn<T>
): ObsListener<T> | ObsListener<T>[] {
    if (isFunction(key)) {
        cb = key as unknown as ListenerFn<T>;
        key = undefined;
    }
    return isArray(args) ? args.map(_listenToObs.bind(this, key, cb)) : _listenToObs(cb, key, args);
}

export function onValue<T extends object>(target: ObsProxy<T>, value: T, cb?: (value: T) => void): Promise<T>;
export function onValue<T extends object, TKey extends keyof T>(
    target: ObsProxy<T>,
    key: TKey,
    value: T[TKey],
    cb?: (value: T) => void
): Promise<T[TKey]>;
export function onValue<T extends object, TKey extends keyof T>(
    target: ObsProxy<T>,
    key: TKey,
    value: T,
    cb?: (value: T) => void
): Promise<T[TKey]> {
    if ((!value || isFunction(value)) && !isString(key)) {
        value = key as unknown as T;
        cb = value as unknown as (value: T) => void;
        key = undefined;
    }
    return new Promise<any>((resolve) => {
        const thisValue = target.value;
        if (value === undefined ? thisValue !== undefined : thisValue === value) {
            cb?.(value);
            resolve(value);
        } else {
            let isDone = false;
            const listener = listenToObs(target, key, (newValue) => {
                if (!isDone && (value === undefined ? thisValue !== undefined : newValue === value)) {
                    isDone = true;
                    cb?.(newValue);
                    resolve(value);
                    disposeListener(listener);
                }
            });
        }
    });
}

export function onHasValue<T extends object>(target: ObsProxy<T>, cb?: (value: T) => void): Promise<T> {
    return onValue(target, undefined, cb);
}

export function onTrue<T extends Record<TKey, boolean>, TKey extends keyof T>(
    target: ObsProxy<T>,
    prop: TKey,
    cb?: () => void
): Promise<void> {
    return onValue(target, prop, true as T[TKey], cb) as unknown as Promise<void>;
}

export function getObsModified(target: ObsProxy) {
    return target.value[symbolDateModified];
}
