import { getObservableFromPrimitive } from './observableFns';

let didOverride = false;

export function extendPrototypes() {
    if (!didOverride) {
        didOverride = true;
        const fn = (name: string) =>
            function (...args: any) {
                const obs = getObservableFromPrimitive(this);
                if (obs) {
                    return obs[name](...args);
                }
            };
        const toOverride = [Number, Boolean, String];
        ['assign', 'get', 'on', 'set', 'delete'].forEach((key) => {
            toOverride.forEach((override) => (override.prototype[key] = fn(key)));
        });
    }
}
