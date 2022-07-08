import { isArray, isFunction, isNumber, isString } from '@legendapp/tools';
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

function getter(proxyOwner: ObsProxy, target: any) {
    const info = state.infos.get(proxyOwner);
    return info.primitive ? target._value : target;
}

function setter(proxyOwner: ObsProxy, _: any, value: any);
function setter(proxyOwner: ObsProxy, _: any, prop: string, value: any);
function setter(proxyOwner: ObsProxy, _: any, prop: string | unknown, value?: any) {
    state.inSetFn = Math.max(0, state.inSetFn++);
    const info = state.infos.get(proxyOwner);
    const target = info.target as any;

    // There was no prop
    if (arguments.length < 4) {
        value = prop;
        prop = undefined;

        const prevValue = info.primitive ? target._value : Object.assign({}, target);

        // 1. Delete keys that no longer exist
        Object.keys(target).forEach((key) => (!value || value[key] === undefined) && delete target[key]);
        // To avoid notifying multiple times as props are changed, make sure we don't notify for this proxy until the assign is done
        state.skipNotifyFor.push(proxyOwner);
        if (isPrimitive(value)) {
            info.primitive = true;
            target._value = value;
        } else {
            info.primitive = false;
            // 2. Copy the values onto the target which will update all children proxies
            proxyOwner.assign(value);
        }
        state.skipNotifyFor.pop();

        // 3. If this has a proxy parent, replace this proxy with a new proxy and copy over listeners.
        // This has to be done to ensure the proxy's target is equal to the value.
        if (info.parent) {
            const parentInfo = state.infos.get(info.parent);
            // Duplicate the old proxy with the new value
            const proxyNew = _obsProxy(value, info.safe, info.parent, info.prop);
            // Set the raw value on the parent's target
            parentInfo.target[info.prop] = value;
            // Move the old proxy's listeners to the new proxy
            const infoNew = state.infos.get(proxyNew);
            if (info.listeners) {
                infoNew.listeners = info.listeners;
                // Need to retarget the listeners to the new proxy
                infoNew.listeners.forEach((listener) => (listener.target = proxyNew));
            }
            // Replace the proxy on the parent
            parentInfo.proxies.set(info.prop, proxyNew);
            // Delete the old proxy from state
            state.infos.delete(proxyOwner);
            proxyOwner = proxyNew;
        }
        if (value !== prevValue) {
            obsNotify(proxyOwner, value, prevValue, []);
        }
    } else if (typeof prop === 'symbol') {
        target[prop] = value;
    } else if (isString(prop) || isNumber(prop)) {
        const propStr = String(prop);
        const proxy = info?.proxies?.get(prop);
        if (proxy) {
            if (value === undefined) {
                // Setting to undefined deletes this proxy
                const prevValue = target[prop];
                state.infos.delete(proxy);
                info.proxies.delete(prop);
                target[prop] = value;
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
                // Notify listeners of changes.
                obsNotify(proxyOwner, target, prevValue, []);
            }
        } else {
            const prevValue = target[prop];
            if (value !== prevValue) {
                target[prop] = value;
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
    get(target: object, prop: string, proxyOwner: ObsProxy) {
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
        } else if (ProxyFunctions.has(prop)) {
            // Calling a proxy function returns a bound function
            // Note: This is after the check for isCollection so we don't overwrite the collection set function
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

function _obsProxy<T>(value: T, safe: boolean, parent?: ObsProxy, prop?: string): ObsProxy<T> {
    const primitive = isPrimitive(value);
    const target = primitive ? { _value: value } : (value as unknown as object);
    const proxy = new Proxy(target, proxyGet);
    // Save proxy to state so it can be accessed later
    state.infos.set(proxy, { parent, prop, safe, target, primitive });

    return proxy;
}

function obsProxy<T>(value?: T): ObsProxy<T>;
function obsProxy<T>(value: T, unsafe: true): ObsProxyUnsafe<T>;
function obsProxy<T>(value?: T, unsafe?: boolean): ObsProxy<T> | ObsProxyUnsafe<T> {
    return _obsProxy(value, !unsafe);
}

export { obsProxy };
