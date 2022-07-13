import { isObject } from '@legendapp/tools';
import { isObjectEmpty, isPrimitive, symbolDateModified } from './globals';
import { ObsBatcher } from './ObsBatcher';
import { EventType, ListenerFn, ObsListener, ObsListenerInfo, ObsProxy, ObsProxyChecker } from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';
import { state } from './ObsProxyState';

const symbolHasValue = Symbol('__hasValue');

function _obsNotify(target: ObsProxyChecker, listenerInfo: ObsListenerInfo) {
    const info = state.infos.get(target);
    const skipNotifyFor = state.skipNotifyFor;
    // Notify this listener if this target is not being skipped (if getting called during an assign)
    if (info && !skipNotifyFor.includes(target)) {
        // Notify all listeners
        if (info.listeners) {
            // Clone because listener handlers may unlisten and modify the original array
            const listeners = info.listeners.slice();
            const value = target.get();
            for (let i = 0; i < listeners.length; i++) {
                const listener = listeners[i];
                ObsBatcher.notify(listener.callback, value, listenerInfo);
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

export function obsNotify<T>(target: ObsProxyChecker<T>, changedValue: T, prevValue: T, path: string[]) {
    _obsNotify(target, { changedValue, prevValue, path });
}

function _listenToObs<T>(callback: ListenerFn<any>, target: ObsProxyChecker<T>) {
    const info = state.infos.get(target);
    if (!info) {
        throw new Error('Can only listen to instances of ObsProxy');
    }
    if (!info.listeners) {
        info.listeners = [];
    }
    const listener = { target, callback } as ObsListener<T>;
    info.listeners.push(listener);
    return listener;
}
export function listenToObs<T>(obs: T, cb: ListenerFn<T>): ObsListener<T> {
    return _listenToObs(cb, obs as ObsProxy<any>) as any;
}

export function onEquals<T>(obs: ObsProxyChecker<T>, value: T, cb?: (value: T) => void): Promise<T> {
    return new Promise<any>((resolve) => {
        if (isPrimitive(obs)) {
            obs = getProxyFromPrimitive(obs);
        }
        let isDone = false;
        let listener: ObsListener<T>;
        function check(newValue) {
            if (
                !isDone &&
                (value === (symbolHasValue as any)
                    ? // If value param is symbolHasValue, then this is from onHasValue so resolve if newValue is anything but undefined or empty object
                      newValue !== undefined && newValue !== null && newValue !== !isObjectEmpty(newValue)
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
            listener = listenToObs(obs, check);
        }
    });
}

export function onHasValue<T>(obs: ObsProxyChecker<T>, cb?: (value: T) => void): Promise<T> {
    return onEquals(obs, symbolHasValue as any, cb);
}

export function onTrue<T extends boolean>(obs: ObsProxyChecker<T>, cb?: () => void): Promise<void> {
    return onEquals(obs, true as T, cb) as unknown as Promise<void>;
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

export function on(obs: ObsProxyChecker, _: any, eventType: EventType, ...args) {
    return ProxyOnFunctions[eventType](obs, ...args);
}

export function assignDeep<T extends ObsProxyChecker>(obs: T, cb: Function) {
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

export function prop(obs: ObsProxyChecker, _: any, prop: string | number) {
    state.inProp = true;
    return obs[prop];
}

export function getProxyFromPrimitive(primitive: any) {
    if (state.lastAccessedProxy) {
        const { proxy, prop } = state.lastAccessedProxy;
        const info = state.infos.get(proxy);
        // Make sure the primitive being accessed is the one from lastAccessedProxy
        // == instead of === because some platforms like React native fail here on ===
        if (info.target[prop] == primitive) {
            return proxy.prop(prop);
        }
    }
}

export function deleteFn(obs: ObsProxyChecker, target: any, prop?: string | number) {
    const info = state.infos.get(obs);
    if (prop !== undefined) {
        const targetOriginal = info.targetOriginal;

        const prevValue = info.primitive ? target._value : Object.assign({}, target);

        const shouldNotify = isObject(target) && target.hasOwnProperty(prop);

        delete target[prop];
        delete targetOriginal[prop];
        info.proxies?.delete(prop);

        if (shouldNotify) {
            obsNotify(obs, target, prevValue, []);
        }
    } else {
        // Delete self
        const parent = info.parent;
        if (parent) {
            const parentInfo = state.infos.get(info.parent);
            if (parentInfo) {
                deleteFn(parent, parentInfo.target, info.prop);
            }
        }
    }

    return obs;
}
