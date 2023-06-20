import { observableFns } from './observable';
import type { NodeValue } from './observableInterfaces';
import { ObservablePrimitiveClass } from './ObservablePrimitive';

export const config = {
    enableDirectAccess: true,
};

export function configureLegendState({
    observableFunctions,
}: {
    observableFunctions?: Record<string, (node: NodeValue, ...args: any[]) => any>;
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
}
