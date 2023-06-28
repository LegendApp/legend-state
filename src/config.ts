import { observableFns, observableMiddlewares, observableProperties as _observableProperties } from './observable';
import type { ListenerFn, NodeValue } from './observableInterfaces';
import { ObservablePrimitiveClass } from './ObservablePrimitive';

export function configureLegendState({
    observableFunctions,
    observableProperties,
    middleware,
}: {
    observableFunctions?: Record<string, (node: NodeValue, ...args: any[]) => any>;
    observableProperties?: Record<string, { get: (node: NodeValue) => any; set: (node: NodeValue, value: any) => any }>;
    middleware?: ListenerFn<any>;
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
                get(...args: any[]) {
                    return fns.get.call(this, this._node, ...args);
                },
                set(value: any) {
                    return fns.set.call(this, this._node, value);
                },
            });
        }
    }
    if (middleware) {
        if (!observableMiddlewares.includes(middleware)) {
            observableMiddlewares.push(middleware);
        }
    }
}
