import { isArray, isFunction, isNumber, isString } from '@legendapp/tools';
import { isCollection, isPrimitive, jsonEqual } from './globals';
import { obsNotify, on } from './ObsProxyFns';
import { ObsProxy, ObsProxyUnsafe } from './ObsProxyInterfaces';
import { state } from './ObsProxyState';

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

function collectionSetter(prop: string, proxyOwner: ObsProxy, ...args: any[]) {
    // this = target
    const prevValue =
        (this instanceof Map && new Map(this)) ||
        (this instanceof Set && new Set(this)) ||
        (isArray(this) && this.slice()) ||
        this;

    (this[prop] as Function).apply(this, args);

    obsNotify(proxyOwner, this, prevValue, []);
}

function getter(proxyOwner: ObsProxy, target: any) {
    const info = state.infos.get(proxyOwner);
    return info.primitive ? target._value : target;
}

function setter(proxyOwner: ObsProxy, _: any, value: any);
function setter(proxyOwner: ObsProxy, _: any, prop: string, value: any);
function setter(proxyOwner: ObsProxy, _: any, prop: string | unknown, value?: any) {
    state.inSetFn = Math.max(0, state.inSetFn++);
    const info = state.infos.get(proxyOwner);
    if (!info) debugger;

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
                delete target[key];
                delete targetOriginal[key];
                info.proxies?.delete(key);
            }
        });

        // To avoid notifying multiple times as props are changed, make sure we don't notify for this proxy until the assign is done
        state.skipNotifyFor.push(proxyOwner);

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

        state.skipNotifyFor.pop();

        // 3. If this has a proxy parent, update the parent's target with this value to fix the shallow copy problem
        if (info.parent) {
            const parentInfo = state.infos.get(info.parent);
            parentInfo.target[info.prop] = value;
            parentInfo.targetOriginal[info.prop] = value;
        }

        if (!jsonEqual(value, prevValue)) {
            obsNotify(proxyOwner, value, prevValue, []);
        }
    } else if (typeof prop === 'symbol') {
        target[prop] = value;
        targetOriginal[prop] = value;
    } else if (isString(prop) || isNumber(prop)) {
        const propStr = String(prop);
        const proxy = info?.proxies?.get(propStr);
        if (proxy) {
            if (value === undefined) {
                // Setting to undefined deletes this proxy
                const prevValue = target[prop];
                state.infos.delete(proxy);
                info.proxies.delete(propStr);
                target[prop] = value;
                targetOriginal[prop] = value;
                obsNotify(proxyOwner, value, prevValue, [propStr]);
            } else {
                // If prop has a proxy, forward the set into the proxy
                setter(proxy, target[prop], value);
            }
        } else if (isArray(target)) {
            // Ignore array length changing because that's caused by mutations which already notified.
            if (prop !== 'length' && target[prop] !== value) {
                const prevValue = target.slice();
                target[prop] = value;
                targetOriginal[prop] = value;
                // Notify listeners of changes.
                obsNotify(proxyOwner, target, prevValue, []);
            }
        } else {
            const prevValue = target[prop];
            if (!jsonEqual(value, prevValue)) {
                target[prop] = value;
                targetOriginal[prop] = value;
                // Notify listeners of changes.
                obsNotify(proxyOwner, value, prevValue, [propStr]);
            }
        }
    }
    state.inSetFn--;

    return prop ? proxyOwner[prop as string] : proxyOwner;
}

function assigner(proxyOwner: ObsProxy, target: any, value: any) {
    state.inAssign = Math.max(0, state.inAssign + 1);
    Object.assign(proxyOwner, value);
    state.inAssign--;

    return this;
}

const ProxyFunctions = new Map<any, any>([
    ['get', getter],
    ['set', setter],
    ['assign', assigner],
    ['on', on],
]);

const proxyGet = {
    get(_: any, prop: string, proxyOwner: ObsProxy) {
        const info = state.infos.get(proxyOwner);
        const target = info.target as any;
        if (isFunction(target[prop]) && isCollection(target)) {
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
            return target[prop].bind(target);
        } else if (ProxyFunctions.has(prop)) {
            // Calling a proxy function returns a bound function
            return ProxyFunctions.get(prop).bind(proxyOwner, proxyOwner, target);
        } else {
            let proxy = info.proxies?.get(prop);

            // Getting a property creates a proxy for it
            if (
                !proxy &&
                target.hasOwnProperty(prop) !== undefined &&
                !info.primitive &&
                !isFunction(target[prop]) &&
                !isArray(target)
            ) {
                if (!info.proxies) {
                    info.proxies = new Map();
                }
                proxy = _obsProxy(target[prop], info.safe, proxyOwner, prop);
                info.proxies.set(prop, proxy);
            }
            return proxy || target[prop];
        }
    },
    set(_: any, prop: string, value: any, proxyOwner: ObsProxy) {
        const info = state.infos.get(proxyOwner);
        const target = info.target as any;

        if (state.inAssign > 0) {
            setter(proxyOwner, target, prop, value);
            return true;
        } else if (state.inSetFn > 0) {
            // Set function handles notifying
            Reflect.set(target, prop, value);
            return true;
        } else {
            const info = state.infos.get(proxyOwner);
            // Only allow setting if this proxy is not safe
            if (!info.safe) {
                setter(proxyOwner, target, prop, value);
                return true;
            }

            return false;
        }
    },
};

function _obsProxy<T>(value: T, safe: boolean, parent?: ObsProxy, prop?: string): ObsProxy<T> {
    const primitive = isPrimitive(value);
    const target = primitive ? { _value: value } : (value as unknown as object);
    const proxy = new Proxy(target, proxyGet);
    // Save proxy to state so it can be accessed later
    state.infos.set(proxy, { parent, prop, safe, target, primitive, targetOriginal: target });

    return proxy;
}

function obsProxy<T>(value?: T): ObsProxy<T>;
function obsProxy<T>(value: T, unsafe: true): ObsProxyUnsafe<T>;
function obsProxy<T>(value?: T, unsafe?: boolean): ObsProxy<T> | ObsProxyUnsafe<T> {
    return _obsProxy(value, !unsafe);
}

export { obsProxy };
