import { isArray, isObject } from '@legendapp/tools';
import { obsNotify } from './ObsProxyFns';
import { ObsProxy } from './ObsProxyInterfaces';
import { state } from './ObsProxyState';

function isPrimitive(val: any) {
    return !isObject(val) && !isArray(val);
}

const proxyGet = {
    get(target: any, prop: string, proxyOwner: ObsProxy) {
        const info = state.infos.get(proxyOwner);
        if (prop === 'value') {
            return info.isWrapped ? target[prop] : target;
        } else if (prop === 'set') {
            return (value) => { target.value = value; return proxyOwner; }
        } else {
            let proxy = info.proxies?.get(prop);

            if (!proxy) {
                if (!info.proxies) {
                    info.proxies = new Map();
                }
                proxy = _obsProxy(target[prop], proxyOwner, prop);
                info.proxies.set(prop, proxy);
            }

            return proxy || target[prop];
        }
    },
    set(target: ObsProxy, prop: string, value: any, proxyOwner: ObsProxy) {
        const info = state.infos.get(proxyOwner);
        const proxy = info?.proxies?.get(prop);

        if (prop === 'value') {
            // Setting value should replace the target with the new value
            let prevValue: any;
            let changed;
            if (info.isWrapped) {
                // If this is a wrapped primitive set the value on it directly
                prevValue = target.value;
                changed = prevValue !== value;
                if (changed) {
                    target.value = value;
                }
            } else {
                changed = true;
                prevValue = Object.assign({}, target.value);
                // Delete keys that no longer exist
                Object.keys(target).forEach((key) => (!value || value[key] === undefined) && delete target[key]);
                if (value) {
                    // Set all of the new properties on the target
                    Object.assign(target, value);
                }
            }
            if (changed) {
                obsNotify(proxyOwner, value, prevValue, []);
            }
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
        } else {
            const prevValue = target[prop];
            if (value !== prevValue) {
                target[prop] = value;
                // Notify listeners of changes.
                // Ignore array length changing because that's caused by mutations which already notified.
                if (!(prop === 'length' && isArray(target))) {
                    obsNotify(proxyOwner, value, prevValue, [prop]);
                }
            }
        }

        return true;
    },
};

function _obsProxy<T>(value: T, parent?: ObsProxy<any>, prop?: string): ObsProxy<T> {
    // If it's a primitive it needs to be wrapped in { value } because Proxy requires an object
    const isWrapped = isPrimitive(value);
    const _value = isWrapped ? { value } : value;
    const proxy = new Proxy(_value as object, proxyGet) as ObsProxy<T>;

    // Save proxy to state so it can be accessed later
    state.infos.set(proxy, { isWrapped, parent, prop });

    return proxy;
}

function obsProxy<T extends any>(value: T = undefined): ObsProxy<T> {
    return _obsProxy(value);
}

export { obsProxy };
