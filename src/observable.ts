import { isArray, isFunction, isNumber, isObject, isString } from '@legendapp/tools';
import { observableConfiguration } from './configureObservable';
import { clone, isCollection, isPrimitive, symbolShallow, symbolValue } from './globals';
import { observableBatcher } from './observableBatcher';
import { notifyChildrenDeleted, notifyObservable, observableProp, prop, _on } from './observableFns';
import { state } from './observableState';
import { extendPrototypes } from './primitivePrototypes';
import {
    Observable,
    ObservableChecker,
    ObservableCheckerWriteable,
    ObservableFnName,
    ObservableUnsafe,
    ValidObservableParam,
} from './observableInterfaces';

const { infos, skipNotifyFor, updateTracking, lastAccessedProxy } = state;

const MapModifiers = {
    clear: true,
    delete: true,
    set: true,
};

const ArrayModifiers = {
    copyWithin: true,
    fill: true,
    from: true,
    pop: true,
    push: true,
    reverse: true,
    shift: true,
    sort: true,
    splice: true,
    unshift: true,
};

const SetModifiers = {
    add: true,
    clear: true,
    delete: true,
};

const WeakMapModifiers = {
    set: true,
    delete: true,
};

const WeakSetModifiers = {
    add: true,
    delete: true,
};

function collectionSetter(prop: string, proxyOwner: Observable, ...args: any[]) {
    // this = target
    const prevValue =
        (this instanceof Map && new Map(this)) ||
        (this instanceof Set && new Set(this)) ||
        (isArray(this) && this.slice()) ||
        this;

    (this[prop] as Function).apply(this, args);

    if (isArray(this)) {
        const info = infos.get(proxyOwner);

        info.target = prevValue;

        _set(proxyOwner, info.target, this);
    } else {
        notifyObservable(proxyOwner, this, prevValue, []);
    }
}

function _get(proxyOwner: Observable) {
    const info = infos.get(proxyOwner);
    const target = info.target as any;
    return info.disposed ? undefined : info.primitive ? target[symbolValue] : target;
}

function _set(proxyOwner: ObservableCheckerWriteable, _: any, value: any);
function _set(proxyOwner: ObservableCheckerWriteable, _: any, prop: string | number | symbol, value: any);
function _set(proxyOwner: ObservableCheckerWriteable, _: any, prop: string | number | symbol | unknown, value?: any) {
    state.inSetFn = Math.max(0, state.inSetFn++);
    const info = infos.get(proxyOwner);

    if (info.readonly) {
        return proxyOwner;
    }

    const target = info.target as any;

    // There was no prop
    if (arguments.length < 4) {
        value = prop;
        prop = undefined;

        const isValuePrimitive = isPrimitive(value);

        const prevValue = info.primitive ? target[symbolValue] : clone(target);

        if (value === prevValue) {
            return proxyOwner;
        }

        const needsNotifyUndefined = !value || isValuePrimitive !== info.primitive;

        // 1. Delete keys that no longer exist
        Object.keys(target).forEach((key) => {
            if (needsNotifyUndefined || (value[key] === undefined && value[+key] === undefined)) {
                if (info.proxies) {
                    const child = info.proxies.get(key);
                    if (child) {
                        notifyChildrenDeleted(child);
                        info.proxies.delete(key);
                    }
                }
            }
        });

        // To avoid notifying multiple times as props are changed, make sure we don't notify for this proxy until the assign is done
        skipNotifyFor.push(proxyOwner);

        if (isValuePrimitive) {
            info.primitive = true;
            info.target = { [symbolValue]: value };
        } else {
            info.primitive = false;

            if (info.proxies) {
                // 2. Update all child proxies
                info.proxies.forEach((child) => {
                    const childInfo = infos.get(child);
                    const prop = childInfo.prop;
                    if (value[prop] !== childInfo.target) {
                        _set(child, childInfo.target, value[childInfo.prop]);
                    }
                });
            }
            info.target = value;
        }

        skipNotifyFor.pop();

        // 3. If this has a proxy parent, update the parent's target with this value to fix the shallow copy problem
        if (info.parent) {
            const parentInfo = infos.get(info.parent);
            parentInfo.target[info.prop] = value;
        }

        if (value !== prevValue) {
            notifyObservable(proxyOwner, value, prevValue, []);
        }
    } else if (typeof prop === 'symbol') {
        target[prop] = value;
    } else if (isString(prop) || isNumber(prop)) {
        const propStr = String(prop);
        const proxy = info?.proxies?.get(propStr);
        if (proxy) {
            // If prop has a proxy, forward the set into the proxy
            _set(proxy, target[prop], value);
        } else if (isArray(target)) {
            // Ignore array length changing because that's caused by mutations which already notified.
            if (prop !== 'length' && target[prop] !== value) {
                const prevValue = target.slice();
                target[prop] = value;
                // Notify listeners of changes.
                notifyObservable(proxyOwner, target, prevValue, []);
            }
        } else {
            const prevValue = clone(target[prop]);
            if (value !== prevValue) {
                target[prop] = value;
                info.primitive = false;
                delete target[symbolValue];
                // Notify listeners of changes
                notifyObservable(proxyOwner, value, prevValue, [propStr]);
            }
        }
    }
    state.inSetFn--;

    return prop ? proxyOwner[prop as string] : proxyOwner;
}

function _assign(proxyOwner: Observable, _: any, value: any) {
    state.inAssign = Math.max(0, state.inAssign + 1);

    Object.assign(proxyOwner, value);

    state.inAssign--;

    return this;
}

function __assign(proxyOwner: Observable, _: any, value: any) {
    // Batch all the changes while assigning
    observableBatcher.begin();
    const ret = _assign(proxyOwner, _, value);
    observableBatcher.end();

    return ret;
}

function __set(proxyOwner: Observable) {
    // Batch all the changes while assigning
    observableBatcher.begin();
    const ret = _set.apply(proxyOwner, arguments);
    observableBatcher.end();

    return ret;
}

function binder(fn, obs: ObservableChecker) {
    obs = prop(obs);
    return fn.bind(obs, obs, undefined);
}
export function setter<T>(obs: ObservableCheckerWriteable<T>) {
    return binder(_set, obs);
}
export function getter<T>(obs: ObservableChecker<T>) {
    return binder(_get, obs);
}
export function assigner<T>(obs: ObservableCheckerWriteable<T>) {
    return binder(_assign, obs);
}

export function deleteFn(obs: ObservableCheckerWriteable, target: any, prop?: string | number | symbol) {
    const info = infos.get(obs);

    if (!info.readonly) {
        if (prop !== undefined) {
            // First notify of deletion
            if (info.proxies?.has(prop)) {
                notifyChildrenDeleted(obs.prop(prop));
            }

            // Then fully delete the keys from the object
            delete target[prop];

            // TODO Should find a way to remove from state.infos or there will be a memory leak if deleting
            // unique keys often. Re-addeding the same prop will reuse the same proxy.
        } else {
            // Delete self forwards into parent
            const parent = info.parent;
            if (parent) {
                const parentInfo = infos.get(info.parent);
                if (parentInfo) {
                    deleteFn(parent, parentInfo.target, info.prop);
                }
            }
        }
    }

    return obs;
}

const ProxyFunctions = new Map<ObservableFnName, any>([
    ['get', _get],
    ['set', __set],
    ['assign', __assign],
    ['on', _on],
    ['prop', observableProp],
    ['delete', deleteFn],
]);

const proxyHandlerUnsafe: ProxyHandler<any> = {
    get(_: any, prop: string | symbol, proxyOwner: Observable) {
        const info = infos.get(proxyOwner);
        const target = info.target as any;
        const targetValue = target[prop];
        if (isFunction(targetValue) && isCollection(target)) {
            // If this is a modifying function on a collection, use custom setter which notifies of changes
            // Note: This comes first so we don't overwrite the collection set function
            if (
                (target instanceof Map && MapModifiers[prop]) ||
                (target instanceof WeakMap && WeakMapModifiers[prop]) ||
                (target instanceof Set && SetModifiers[prop]) ||
                (target instanceof WeakSet && WeakSetModifiers[prop]) ||
                (isArray(target) && ArrayModifiers[prop])
            ) {
                return collectionSetter.bind(target, prop, proxyOwner);
            }

            // Non-modifying functions pass straight through
            return targetValue.bind(target);
        } else if (ProxyFunctions.has(prop as ObservableFnName)) {
            updateTracking(proxyOwner, undefined, info, /*shallow*/ false);

            // Calling a proxy function returns a bound function
            return ProxyFunctions.get(prop as ObservableFnName).bind(proxyOwner, proxyOwner, target);
        } else if (prop === symbolShallow) {
            updateTracking(proxyOwner, undefined, info, /*shallow*/ true);
            return proxyOwner;
        } else {
            // Update lastAccessedProxy to support extended prototype functions on primitives
            if (observableConfiguration.extendPrototypes) {
                lastAccessedProxy.proxy = proxyOwner;
                lastAccessedProxy.prop = prop;
            }

            updateTracking(proxyOwner, prop, info, /*shallow*/ false);

            if (
                prop !== symbolValue &&
                (state.inProp || targetValue === undefined || targetValue === null || !isPrimitive(targetValue)) &&
                !(targetValue instanceof Promise) &&
                !isFunction(targetValue)
            ) {
                // Get proxy for prop if it's not a primitive or if using `prop` function
                state.inProp = false;
                let proxy = info.proxies?.get(prop);

                // Getting a property creates an observable proxy for it
                if (!proxy && target.hasOwnProperty(prop) !== undefined) {
                    if (!info.proxies) {
                        info.proxies = new Map();
                    }
                    proxy = _observable(targetValue, info.safe, proxyOwner, prop);
                    info.proxies.set(prop, proxy);
                }
                return proxy || targetValue;
            } else {
                return targetValue;
            }
        }
    },
    set(_: any, prop: string, value: any, proxyOwner: Observable) {
        const info = infos.get(proxyOwner);
        const target = info.target as any;

        if (state.inAssign > 0) {
            _set(proxyOwner, target, prop, value);
            return true;
        } else if (state.inSetFn > 0) {
            // If this assignment comes from within a set function it's allowed.
            // Notifying listeners will be handled elsewhere
            Reflect.set(target, prop, value);
            return true;
        } else {
            const info = infos.get(proxyOwner);
            // Only allow setting directly if this proxy is unsafe
            if (!info.safe) {
                _set(proxyOwner, target, prop, value);
                return true;
            }

            if (process.env.NODE_ENV === 'development') {
                throw new Error(
                    'Cannot directly assign to an observable. Use observable.set(...) or observable.assign(...) instead. See https://www.legendapp.com/dev/state/safety/'
                );
            }

            return false;
        }
    },
    ownKeys() {
        const info = infos.get(this);
        const keys = Reflect.ownKeys(info.target);
        return keys;
    },
    getOwnPropertyDescriptor(_, p) {
        const info = infos.get(this);
        return Reflect.getOwnPropertyDescriptor(info.target, p);
    },
    // has(target, p) {
    //     debugger;
    //     return true;
    // },
};

// Safe observables also don't allow defining or deleting properties
const proxyHandler = Object.assign(
    {
        deleteProperty() {
            if (process.env.NODE_ENV === 'development') {
                throw new Error(
                    'Cannot directly delete an observable. Use observable.delete() instead. See https://www.legendapp.com/dev/state/safety/'
                );
            }
            return false;
        },
        defineProperty() {
            if (process.env.NODE_ENV === 'development') {
                throw new Error(
                    'Cannot defineProperty on an observable. See https://www.legendapp.com/dev/state/safety/'
                );
            }
            return false;
        },
    },
    proxyHandlerUnsafe
);

function _observable<T>(
    value: ValidObservableParam<T>,
    safe: boolean,
    parent?: Observable,
    prop?: string | number | symbol
): Observable<T> {
    const primitive = isPrimitive(value);
    const target = primitive ? { [symbolValue]: value } : (value as unknown as object);
    const handler = Object.assign({}, safe ? proxyHandler : proxyHandlerUnsafe);
    const proxy = new Proxy(target, handler);
    handler.ownKeys = handler.ownKeys.bind(proxy);
    handler.getOwnPropertyDescriptor = handler.getOwnPropertyDescriptor.bind(proxy);
    // Save proxy to state so it can be accessed later
    infos.set(proxy, { parent, prop, safe, target, primitive });

    return proxy;
}

function observable<T>(value?: ValidObservableParam<T>): Observable<T>;
function observable<T>(value: ValidObservableParam<T>, unsafe: true): ObservableUnsafe<T>;
function observable<T>(value?: ValidObservableParam<T>, unsafe?: boolean): Observable<T> | ObservableUnsafe<T> {
    if (!state.didOverride && observableConfiguration.extendPrototypes) {
        extendPrototypes();
    }
    return _observable(value, !unsafe);
}

export { observable };
