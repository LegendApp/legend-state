import { internal } from '@legendapp/state';
import type { NodeInfo } from '@legendapp/state';

const { globalState, observableProperties: _observableProperties, observableFns, ObservablePrimitiveClass } = internal;

export function configureLegendState({
    observableFunctions,
    observableProperties,
    jsonReplacer,
    jsonReviver,
}: {
    observableFunctions?: Record<string, (node: NodeInfo, ...args: any[]) => any>;
    observableProperties?: Record<string, { get: (node: NodeInfo) => any; set: (node: NodeInfo, value: any) => any }>;
    jsonReplacer?: (this: any, key: string, value: any) => any;
    jsonReviver?: (this: any, key: string, value: any) => any;
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
    if (jsonReplacer) {
        globalState.replacer = jsonReplacer;
    }
    if (jsonReviver) {
        globalState.reviver = jsonReviver;
    }
}
