import { isArray, isFunction, isNumber, isString } from '@legendapp/tools';
import { observableConfiguration } from './configureObservable';
import { isCollection, isPrimitive, jsonEqual, symbolShallow } from './globals';
import { observableBatcher } from './observableBatcher';
import { notifyObservable, observableProp, prop, _on } from './observableFns';
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

    notifyObservable(proxyOwner, this, prevValue, []);
}

function _get(proxyOwner: Observable) {
    const info = infos.get(proxyOwner);
    const target = info.target as any;
    return info.primitive ? target._value : target;
}

function _set(proxyOwner: ObservableCheckerWriteable, _: any, value: any);
function _set(proxyOwner: ObservableCheckerWriteable, _: any, prop: string | number | symbol, value: any);
function _set(proxyOwner: ObservableCheckerWriteable, _: any, prop: string | number | symbol | unknown, value?: any) {
    state.inSetFn = Math.max(0, state.inSetFn++);
    const info = infos.get(proxyOwner);
    if (!info) debugger;

    if (info.readonly) {
        return proxyOwner;
    }

    // Need to keep both target and targetOriginal up to date. targetOriginal may not be
    // an === match but it needs to have the same keys.
    const target = info.target as any;
    const targetOriginal = info.targetOriginal;

    // There was no prop
    if (arguments.length < 4) {
        value = prop;
        prop = undefined;

        const isValuePrimitive = isPrimitive(value);

        const prevValue = info.primitive ? target._value : Object.assign({}, target);

        // 1. Delete keys that no longer exist
        Object.keys(target).forEach((key) => {
            if (!value || isValuePrimitive !== info.primitive || value[key] === undefined) {
                if (info.proxies) {
                    const child = info.proxies.get(key);
                    if (child) {
                        child.set(undefined);
                    }
                }
                delete target[key];
                delete targetOriginal[key];
            }
        });

        // To avoid notifying multiple times as props are changed, make sure we don't notify for this proxy until the assign is done
        skipNotifyFor.push(proxyOwner);

        if (isValuePrimitive) {
            info.primitive = true;
            target._value = value;
        } else {
            info.primitive = false;
            // 2. Assign the values onto the target which will update all children proxies, but would leave this
            // as a shallow copy of the the value
            proxyOwner.assign(value);
            Object.assign(targetOriginal, value);
            info.target = value;
        }

        skipNotifyFor.pop();

        // 3. If this has a proxy parent, update the parent's target with this value to fix the shallow copy problem
        if (info.parent) {
            const parentInfo = infos.get(info.parent);
            parentInfo.target[info.prop] = value;
            parentInfo.targetOriginal[info.prop] = value;
        }

        if (!jsonEqual(value, prevValue)) {
            notifyObservable(proxyOwner, value, prevValue, []);
        }
    } else if (typeof prop === 'symbol') {
        target[prop] = value;
        targetOriginal[prop] = value;
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
                target[prop] = targetOriginal[prop] = value;
                // Notify listeners of changes.
                notifyObservable(proxyOwner, target, prevValue, []);
            }
        } else {
            const prevValue = target[prop];
            if (!jsonEqual(value, prevValue)) {
                target[prop] = targetOriginal[prop] = value;
                // Notify listeners of changes.
                notifyObservable(proxyOwner, value, prevValue, [propStr]);
            }
        }
    }
    state.inSetFn--;

    return prop ? proxyOwner[prop as string] : proxyOwner;
}

function _assign(proxyOwner: Observable, _: any, value: any) {
    state.inAssign = Math.max(0, state.inAssign + 1);

    // Batch all the changes while assigning
    observableBatcher.begin();
    Object.assign(proxyOwner, value);
    observableBatcher.end();

    state.inAssign--;

    return this;
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
            const targetOriginal = info.targetOriginal;

            // First set to undefined
            _set(obs, target, prop, undefined);

            // Then fully delete the keys from the object
            delete target[prop];
            delete targetOriginal[prop];

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
    ['set', _set],
    ['assign', _assign],
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
        } else if ((prop as any) === symbolShallow) {
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
                (state.inProp || targetValue === undefined || targetValue === null || !isPrimitive(targetValue)) &&
                !(targetValue instanceof Promise) &&
                !isFunction(targetValue)
            ) {
                // Get proxy for prop if it's not a primitive or using prop(key)
                state.inProp = false;
                let proxy = info.proxies?.get(prop);

                // Getting a property creates a proxy for it
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
            // Set function handles notifying
            Reflect.set(target, prop, value);
            return true;
        } else {
            const info = infos.get(proxyOwner);
            // Only allow setting if this proxy is not safe
            if (!info.safe) {
                _set(proxyOwner, target, prop, value);
                return true;
            }

            return false;
        }
    },
};

const proxyHandler = Object.assign(
    {
        deleteProperty() {
            return false;
        },
        defineProperty() {
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
    const target = primitive ? { _value: value } : (value as unknown as object);
    const proxy = new Proxy(target, safe ? proxyHandler : proxyHandlerUnsafe);
    // Save proxy to state so it can be accessed later
    infos.set(proxy, { parent, prop, safe, target, primitive, targetOriginal: target });

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
