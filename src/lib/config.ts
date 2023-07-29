import { observableProperties as _observableProperties, observableFns } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import type { NodeValue } from './observableInterfaces';

export function configureLegendState({
    observableFunctions,
    observableProperties,
}: {
    observableFunctions?: Record<string, (node: NodeValue, ...args: any[]) => any>;
    observableProperties?: Record<string, { get: (node: NodeValue) => any; set: (node: NodeValue, value: any) => any }>;
}) {
    if (observableFunctions) {
        for (const key in observableFunctions) {
            const fn = observableFunctions[key];
            observableFns.set(key, fn);
            ObservablePrimitiveClass.prototype[key] = function (...args: any[]) {
                return fn.call(this, this._node, ...args);
            };
        }
    }
    if (observableProperties) {
        for (const key in observableProperties) {
            const fns = observableProperties[key];
            _observableProperties.set(key, fns);
            Object.defineProperty(ObservablePrimitiveClass.prototype, key, {
                configurable: true,
                get() {
                    return fns.get.call(this, this._node);
                },
                set(value: any) {
                    return fns.set.call(this, this._node, value);
                },
            });
        }
    }
}
