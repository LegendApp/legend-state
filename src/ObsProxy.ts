import { isArray, isObject, isFunction, isString } from '@legendapp/tools';
import { obsNotify } from './ObsProxyFns';
import { ObsProxyUnsafe, ObsProxy } from './ObsProxyInterfaces';
import { state } from './ObsProxyState';

function isPrimitive(val: any) {
    return (
        !isObject(val) &&
        !isArray(val) &&
        !(val instanceof WeakMap) &&
        !(val instanceof WeakSet) &&
        !(val instanceof Error) &&
        !(val instanceof Date) &&
        !(val instanceof String) &&
        !(val instanceof ArrayBuffer)
    );
}

function isCollection(obj: any) {
    return isArray(obj) || obj instanceof Map || obj instanceof Set || obj instanceof WeakMap || obj instanceof WeakSet;
}

const MapModifiers = new Map([
    ['clear', true],
    ['delete', true],
    ['set', true],
]);

const ArrayModifiers = new Map([
    ['contact', true],
    ['copyWithin', true],
    ['push', true],
]);

const SetModifiers = new Map([
    ['add', true],
    ['clear', true],
    ['delete', true],
]);

const WeakMapModifiers = new Map([
    ['set', true],
    ['delete', true],
]);

const WeakSetModifiers = new Map([
    ['add', true],
    ['delete', true],
]);

function collectionSetter(prop: string, proxyOwner: ObsProxyUnsafe, ...args: any[]) {
    // this = target
    const prevValue =
        (this instanceof Map && new Map(this)) ||
        (this instanceof Set && new Set(this)) ||
        (isArray(this) && this.slice()) ||
        this;

    (this[prop] as Function).apply(this, args);

    obsNotify(proxyOwner, this, prevValue, []);
}

function getter() {
    // this = proxyOwner
    return state.infos.get(this).target;
}

function setter(proxyOwner: ObsProxyUnsafe, prop: unknown);
function setter(proxyOwner: ObsProxyUnsafe, prop: string, value: any);
function setter(proxyOwner: ObsProxyUnsafe, prop: string | unknown, value?: any) {
    state.isInSetFn = true;
    const info = state.infos.get(proxyOwner);
    const target = info.target;
    // There was no key
    if (arguments.length === 2) {
        value = prop;
        let prevValue: any;
        prevValue = Object.assign({}, target);
        // If this has a proxy parent, replace this proxy with a new proxy and copy over listeners
        if (info.parent) {
            const parentInfo = state.infos.get(info.parent);
            // Duplicate the old proxy with the new value
            const proxyNew = _obsProxy(value, info.safe, info.parent, info.prop);
            // Set the raw value on the target
            parentInfo.target[info.prop] = value;
            // Move the listeners to the new proxy
            const infoNew = state.infos.get(proxyNew);
            infoNew.listeners = info.listeners;

            // Replace the proxy on the parent
            parentInfo.proxies.set(info.prop, proxyNew);

            // Delete the old proxy from state
            state.infos.delete(proxyOwner);
            proxyOwner = proxyNew;
        } else {
            // Don't have a parent so there's no context to replace it with a new proxy, so have to just copy the values onto the target

            // 1. Delete keys that no longer exist
            Object.keys(target).forEach((key) => (!value || value[key] === undefined) && delete target[key]);
            if (value) {
                // 2. Set all of the new properties on the target
                Object.assign(proxyOwner, value);
            }
        }
        obsNotify(proxyOwner, value, prevValue, []);
    } else if (isString(prop)) {
        const proxy = info?.proxies?.get(prop);
        if (proxy) {
            if (value === undefined) {
                // Setting to undefined deletes this proxy
                const prevValue = target[prop];
                state.infos.delete(proxy);
                info.proxies.delete(prop);
                target[prop] = value;
                obsNotify(proxyOwner, value, prevValue, [prop]);
            } else {
                // If prop has a proxy, forward the set into the proxy
                setter(proxy, value);
            }
        } else if (isArray(target)) {
            // Ignore array length changing because that's caused by mutations which already notified.
            if (prop !== 'length' && target[prop] !== value) {
                const prevValue = target.slice();
                target[prop] = value;
                // Notify listeners of changes.
                obsNotify(proxyOwner, target, prevValue, []);
            }
        } else {
            const prevValue = target[prop];
            if (value !== prevValue) {
                target[prop] = value;
                // Notify listeners of changes.
                obsNotify(proxyOwner, value, prevValue, [prop]);
            }
        }
    }
    state.isInSetFn = false;

    return this;
}

function assigner(value: any) {
    // this = proxyOwner
    state.isInSetFn = true;
    Object.assign(this, value);
    state.isInSetFn = false;

    return this;
}

const proxyGet = {
    get(target: any, prop: string, proxyOwner: ObsProxyUnsafe) {
        const info = state.infos.get(proxyOwner);
        if (prop === 'assign') {
            // Calling set on a proxy returns a function which sets the value
            return assigner.bind(proxyOwner);
        } else if (isFunction(target[prop]) && isCollection(target)) {
            // If this is a modifying function on a collection, use custom setter which notifies of changes
            if (
                (target instanceof Map && MapModifiers.has(prop)) ||
                (target instanceof WeakMap && WeakMapModifiers.has(prop)) ||
                (target instanceof Set && SetModifiers.has(prop)) ||
                (target instanceof WeakSet && WeakSetModifiers.has(prop)) ||
                (isArray(target) && ArrayModifiers.has(prop))
            ) {
                return collectionSetter.bind(target, prop, proxyOwner);
            }

            // Non-modifying functions pass straight through
            return target[prop].bind(target);
        } else if (prop === 'set') {
            // Calling set on a proxy returns a function which sets the value
            // Note: This is after the check for isCollection so we don't overwrite the collection set function
            return setter.bind(proxyOwner, proxyOwner);
        } else if (prop === 'get') {
            // Calling set on a proxy returns a function which sets the value
            // Note: This is after the check for isCollection so we don't overwrite the collection set function
            return getter.bind(proxyOwner);
        } else {
            let proxy = info.proxies?.get(prop);

            // Getting a property creates a proxy for it
            if (!proxy && !isPrimitive(target[prop]) && !isFunction(target[prop]) && !isArray(target)) {
                if (!info.proxies) {
                    info.proxies = new Map();
                }
                proxy = _obsProxy(target[prop], info.safe, proxyOwner, prop);
                info.proxies.set(prop, proxy);
            }

            return proxy || target[prop];
        }
    },
    set(target: any, prop: string, value: any, proxyOwner: ObsProxy) {
        if (state.isInSetFn || isArray(target)) {
            Reflect.set(target, prop, value);
            return true;
        }
        const info = state.infos.get(proxyOwner);
        if (!info.safe) {
            setter(proxyOwner, prop, value);
            return true;
        }

        return false;
    },
};

function _obsProxy<T extends object>(
    value: T,
    safe: boolean,
    parent?: ObsProxyUnsafe,
    prop?: string
): ObsProxyUnsafe<T> {
    if (process.env.NODE_ENV === 'development' && isPrimitive(value)) {
        console.error('obsProxy value must be an object');
    }
    if (isPrimitive(value)) debugger;
    // If it's a primitive it needs to be wrapped in { value } because Proxy requires an object
    const proxy = new Proxy(value, proxyGet);
    // Save proxy to state so it can be accessed later
    state.infos.set(proxy, { parent, prop, safe, target: value });

    return proxy;
}

function obsProxy<T extends object>(value: T): ObsProxy<T>;
function obsProxy<T extends object>(value: T, unsafe: true): ObsProxyUnsafe<T>;
function obsProxy<T extends object>(value: T = undefined, unsafe?: boolean): ObsProxy<T> | ObsProxyUnsafe<T> {
    return _obsProxy(value, !unsafe);
}

export { obsProxy };
