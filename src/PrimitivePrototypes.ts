import { getProxyFromPrimitive } from './ObsProxyFns';

let didOverride = false;

export function extendPrototypes() {
    if (!didOverride) {
        didOverride = true;
        const fn = (name: string) =>
            function (...args: any) {
                const proxy = getProxyFromPrimitive(this);
                if (proxy) {
                    return proxy[name](...args);
                }
            };
        const toOverride = [Number, Boolean, String];
        ['assign', 'get', 'on', 'set', 'delete'].forEach((key) => {
            toOverride.forEach((override) => (override.prototype[key] = fn(key)));
        });
    }
}
