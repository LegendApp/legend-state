import { isArray, isFunction, isString } from '@legendapp/tools';
import { isCollection, isPrimitive } from './globals';
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

function getter(_: ObsProxy, target: any) {
    return target;
}

function setter(proxyOwner: ObsProxy, target: any, value: any);
function setter(proxyOwner: ObsProxy, target: any, prop: string, value: any);
function setter(proxyOwner: ObsProxy, target: any, prop: string | unknown, value?: any) {
    state.inSetFn = Math.max(0, state.inSetFn++);
    const info = state.infos.get(proxyOwner);

    // There was no prop
    if (arguments.length < 4) {
        value = prop;
        let prevValue: any;
        prevValue = Object.assign({}, target);

        // 1. Delete keys that no longer exist
        Object.keys(target).forEach((key) => (!value || value[key] === undefined) && delete target[key]);
        state.skipNotifyFor.push(proxyOwner);
        if (value) {
            // 2. Copy the values onto the target which will update all children proxies
            proxyOwner.assign(value);
        }
        state.skipNotifyFor.pop();

        // 3. If this has a proxy parent, replace this proxy with a new proxy and copy over listeners.
        // This has to be done to ensure the proxy's target is equal to the value.
        if (value && info.parent) {
            const parentInfo = state.infos.get(info.parent);
            // Duplicate the old proxy with the new value
            const proxyNew = _obsProxy(value, info.safe, info.parent, info.prop);
            // Set the raw value on the target
            parentInfo.target[info.prop] = value;
            // Move the listeners to the new proxy
            const infoNew = state.infos.get(proxyNew);
            if (info.listeners) {
                infoNew.listeners = info.listeners;
                infoNew.listeners.forEach((listener) => (listener.target = proxyNew));
            }
            // Replace the proxy on the parent
            parentInfo.proxies.set(info.prop, proxyNew);
            // Delete the old proxy from state
            state.infos.delete(proxyOwner);
            proxyOwner = proxyNew;
        }

        obsNotify(proxyOwner, value, prevValue, []);
    } else if (typeof prop === 'symbol') {
        target[prop] = value;
    } else if (isString(prop)) {
        const proxy = info?.proxies?.get(prop as string);
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
                setter(proxy, target[prop], value);
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
    state.inSetFn--;

    return this;
}

function assigner(proxyOwner: ObsProxy, target: any, value: any) {
    state.inAssign = Math.max(0, state.inAssign + 1);
    Object.assign(proxyOwner, value);
    state.inAssign--;

    return this;
}

const ProxyFunctions = {
    get: getter,
    set: setter,
    assign: assigner,
    on: on,
};

const proxyGet = {
    get(target: any, prop: string, proxyOwner: ObsProxy) {
        const info = state.infos.get(proxyOwner);
        if (isFunction(target[prop]) && isCollection(target)) {
            // If this is a modifying function on a collection, use custom setter which notifies of changes
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
        } else if (ProxyFunctions[prop]) {
            // Calling a proxy function returns a bound function
            // Note: This is after the check for isCollection so we don't overwrite the collection set function
            return ProxyFunctions[prop].bind(proxyOwner, proxyOwner, target);
        } else {
            let proxy = info.proxies?.get(prop);

            // Getting a property creates a proxy for it
            if (!proxy && !isPrimitive(target[prop]) && !isFunction(target[prop]) && !isArray(target)) {
                if (!info.proxies) {
                    info.proxies = new Map();
                }
                proxy = _obsProxy(target[prop], info.safe, proxyOwner, prop);
                info.proxies.set(prop, proxy);
            } else if (state.isTrackingPrimitives && !proxy && isPrimitive(target[prop])) {
                state.trackedPrimitives.push([proxyOwner, prop]);
            }
            return proxy || target[prop];
        }
    },
    set(target: any, prop: string, value: any, proxyOwner: ObsProxy) {
        if (state.inAssign > 0) {
            setter(proxyOwner, target, prop, value);
            return true;
        } else if (state.inSetFn > 0) {
            // Set function handles notifying
            Reflect.set(target, prop, value);
            return true;
        } else {
            const info = state.infos.get(proxyOwner);
            if (!info.safe) {
                setter(proxyOwner, target, prop, value);
                return true;
            }

            return false;
        }
    },
};

function _obsProxy<T extends object>(value: T, safe: boolean, parent?: ObsProxy, prop?: string): ObsProxy<T> {
    if (process.env.NODE_ENV === 'development' && isPrimitive(value)) {
        console.error('obsProxy value must be an object');
    }
    if (process.env.NODE_ENV === 'development' && isPrimitive(value)) debugger;
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
