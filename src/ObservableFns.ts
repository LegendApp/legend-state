import { isObject } from '@legendapp/tools';
import { isObjectEmpty, isPrimitive, symbolDateModified } from './globals';
import { ObsBatcher } from './observableBatcher';
import {
    EventType,
    ListenerFn,
    ObsListener,
    ObsListenerInfo,
    Observable,
    ObservableChecker,
    OnReturnValue,
} from './observableInterfaces';
import { disposeListener } from './observableListener';
import { state } from './observableState';

const symbolHasValue = Symbol('__hasValue');

function _obsNotify(target: ObservableChecker, listenerInfo: ObsListenerInfo) {
    const info = state.infos.get(target);
    const skipNotifyFor = state.skipNotifyFor;
    // Notify this listener if this target is not being skipped (if getting called during an assign)
    if (info && !skipNotifyFor.includes(target)) {
        // Notify all listeners
        if (info.listeners) {
            const value = target.get();
            info.listeners.forEach((listener) => {
                ObsBatcher.notify(listener, value, listenerInfo);
            });
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

export function obsNotify<T>(target: ObservableChecker<T>, changedValue: T, prevValue: T, path: string[]) {
    _obsNotify(target, { changedValue, prevValue, path });
}

function _listenToObs<T>(callback: ListenerFn<any>, target: ObservableChecker<T>) {
    const info = state.infos.get(target);
    if (!info) {
        throw new Error('Can only listen to instances of Observable');
    }
    if (!info.listeners) {
        info.listeners = new Set();
    }
    const listener = { target, callback } as ObsListener<T>;
    info.listeners.add(callback);
    return listener;
}
export function listenToObs<T>(obs: T, cb: ListenerFn<T>): ObsListener<T> {
    return _listenToObs(cb, obs as Observable<any>) as any;
}

export function onEquals<T>(obs: ObservableChecker<T>, value: T, cb?: (value: T) => void): OnReturnValue<T> {
    let listener: ObsListener<T>;

    const promise = new Promise<any>((resolve) => {
        if (isPrimitive(obs)) {
            obs = getObservableFromPrimitive(obs);
        }
        let isDone = false;
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

export function getObsModified<T extends ObservableChecker>(obs: T) {
    return obs.get?.()?.[symbolDateModified];
}

export function unlisten<T extends ObservableChecker>(obs: T, cb: ListenerFn<any>) {
    const info = state.infos.get(obs);
    if (info) {
        info.listeners.delete(cb);
    }
}

const ObservableOnFunctions: Record<EventType, Function> = {
    change: listenToObs,
    equals: onEquals,
    hasValue: onHasValue,
    true: onTrue,
};

export function on(obs: ObservableChecker, _: any, eventType: EventType, ...args) {
    return ObservableOnFunctions[eventType](obs, ...args);
}

export function prop(obs: ObservableChecker, _: any, prop: string | number) {
    state.inProp = true;
    return obs[prop];
}

export function getObservableFromPrimitive(primitive: any) {
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

export function deleteFn(obs: ObservableChecker, target: any, prop?: string | number) {
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
