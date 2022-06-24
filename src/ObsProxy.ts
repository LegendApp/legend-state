import { isArray, isObject, isFunction } from '@legendapp/tools';
import { obsNotify } from './ObsProxyFns';
import { ObsProxy, ObsProxySafe } from './ObsProxyInterfaces';
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
    return obj instanceof Map || obj instanceof Set || obj instanceof WeakMap || obj instanceof WeakSet;
}

const MapsModifiers = new Map([
    ['clear', true],
    ['delete', true],
    ['set', true],
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

function collectionSetter(prop: string, proxyOwner: ObsProxy, key: string, value: any) {
    // this = target
    const prevValue = (this instanceof Map && new Map(this)) || (this instanceof Set && new Set(this)) || this;

    this[prop](key, value);

    obsNotify(proxyOwner, this, prevValue, []);
}

function setter(key: unknown, value: undefined);
function setter(key: string, value: any);
function setter(key: string | unknown, value: any) {
    // this = proxyOwner
    state.isInSetFn = true;
    if (value === undefined) {
        this.value = key;
    } else {
        const prevValue = this.value[key as string];
        this.value[key as string] = value;
        obsNotify(this, value, prevValue, [key as string]);
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
    get(target: any, prop: string, proxyOwner: ObsProxy) {
        const info = state.infos.get(proxyOwner);
        if (prop === 'value') {
            // Access the original object
            return target;
        } else if (prop === 'assign') {
            // Calling set on a proxy returns a function which sets the value
            return assigner.bind(proxyOwner);
        } else if (isFunction(target[prop]) && isCollection(target)) {
            // If this is a modifying function on a collection, use custom setter which notifies of changes
            if (
                (target instanceof Map && MapsModifiers.has(prop)) ||
                (target instanceof WeakMap && WeakMapModifiers.has(prop)) ||
                (target instanceof Set && SetModifiers.has(prop)) ||
                (target instanceof WeakSet && WeakSetModifiers.has(prop))
            ) {
                return collectionSetter.bind(target, prop, proxyOwner);
            }

            // Non-modifying functions pass straight through
            return target[prop].bind(target);
        } else if (prop === 'set') {
            // Calling set on a proxy returns a function which sets the value
            // Note: This is after the check for isCollection so we don't overwrite the collection set function
            return setter.bind(proxyOwner);
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
        const info = state.infos.get(proxyOwner);
        const proxy = info?.proxies?.get(prop);

        if (info.safe && !state.isInSetFn) {
            console.error('Cannot set a value directly on a safe ObsProxy. Use .set() instead.');
            return true;
        }

        if (prop === 'value') {
            // Setting value should replace the target with the new value
            let prevValue: any;
            prevValue = Object.assign({}, target.value);
            // Delete keys that no longer exist
            Object.keys(target).forEach((key) => (!value || value[key] === undefined) && delete target[key]);
            if (value) {
                // Set all of the new properties on the target
                Object.assign(proxyOwner, value);
            }
            obsNotify(proxyOwner, value, prevValue, []);
        } else if (proxy) {
            if (value !== undefined) {
                // If prop has a proxy, forward the set into the proxy
                proxy.value = value;
            } else {
                const prevValue = target[prop];
                info.proxies.delete(prop);
                target[prop] = value;
                obsNotify(proxyOwner, value, prevValue, [prop]);
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

        return true;
    },
};

function _obsProxy<T extends object>(value: T, safe: boolean, parent?: ObsProxy, prop?: string): ObsProxy<T> {
    if (process.env.NODE_ENV === 'development' && isPrimitive(value)) {
        console.error('obsProxy value must be an object');
    }
    // If it's a primitive it needs to be wrapped in { value } because Proxy requires an object
    const proxy = new Proxy(value, proxyGet) as ObsProxy<T>;
    // Save proxy to state so it can be accessed later
    state.infos.set(proxy, { parent, prop, safe });

    return proxy;
}

function obsProxy<T extends object>(value: T): ObsProxy<T>;
function obsProxy<T extends object>(value: T, safe: true): ObsProxySafe<T>;
function obsProxy<T extends object>(value: T = undefined, safe?: boolean): ObsProxy<T> | ObsProxySafe<T> {
    return _obsProxy(value, safe);
}

export { obsProxy };
