import { isArray } from '@legendapp/tools';
import { ObsBatcher } from './ObsBatcher';
import { ListenerFn, ObsListener, ObsListenerInfo, ObsProxy } from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';
import { state } from './ObsProxyState';

function _obsNotify(target: ObsProxy<any>, listenerInfo: ObsListenerInfo) {
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

export function obsNotify<T>(target: ObsProxy<T>, changedValue: T, prevValue: T, path: string[]) {
    _obsNotify(target, { changedValue, prevValue, path });
}

function _listenToObs<T>(callback: ListenerFn<T>, target: ObsProxy<T>) {
    const info = state.infos.get(target);
    if (!info) debugger;
    if (!info.listeners) {
        info.listeners = [];
    }
    const listener = { target, callback } as ObsListener<T>;
    info.listeners.push(listener);
    return listener;
}
export function listenToObs<T>(obs: ObsProxy<T>, cb: ListenerFn<T>): ObsListener<T>;
export function listenToObs<T>(obs: ObsProxy<T> | ObsProxy<T>[], cb: ListenerFn<T>): ObsListener<T>[];
export function listenToObs<T>(
    args: ObsProxy<T> | ObsProxy<T>[],
    cb: ListenerFn<T>
): ObsListener<T> | ObsListener<T>[] {
    return isArray(args) ? args.map(_listenToObs.bind(this, cb)) : _listenToObs(cb, args);
}

export function onValue<T>(target: ObsProxy<T>, value: T, cb?: (value: T) => void): Promise<T> {
    return new Promise<T>((resolve) => {
        const thisValue = target.value;
        if (value === undefined ? thisValue !== undefined : thisValue === value) {
            cb?.(value);
            resolve(value);
        } else {
            let isDone = false;
            const listener = listenToObs(target, (newValue) => {
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

export function onHasValue<T>(target: ObsProxy<T>, cb?: (value: T) => void): Promise<T> {
    return onValue(target, undefined, cb);
}

export function onTrue(target: ObsProxy<boolean>, cb?: (value: boolean) => void): Promise<boolean> {
    return onValue(target, true, cb);
}
