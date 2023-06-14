import {
    checkActivate,
    configureLegendState,
    extraPrimitiveActivators,
    extraPrimitiveProps,
    getNode,
    internal,
    NodeValue,
    ObservablePrimitiveClass,
    ObservableReadable,
} from '@legendapp/state';
import { createElement, memo } from 'react';
import { hasSymbol } from './reactive-observer';
import { useSelector } from './useSelector';

let isRenderEnabled = false;

export function enableLegendStateReact(options?: { renderDirectly?: boolean; enableUse?: boolean }) {
    if (!options || options.enableUse) {
        configureLegendState({
            observableFunctions: {
                use: (node: NodeValue) => useSelector(() => internal.get(node)),
            },
        });
    }

    if (!isRenderEnabled && (!options || options.renderDirectly)) {
        isRenderEnabled = true;

        // Rendering observables directly inspired by Preact Signals: https://github.com/preactjs/signals/blob/main/packages/react/src/index.ts
        // Add the extra primitive props so that observables can render directly
        // Memoized component to wrap the observable value
        const Text = memo(function Text({ data }: { data: ObservableReadable }) {
            const value = useSelector(data);

            checkActivate(getNode(data));

            return value;
        });

        const ReactTypeofSymbol = hasSymbol ? Symbol.for('react.element') : (createElement('a') as any).$$typeof;

        const s = extraPrimitiveProps;
        const proto = {} as Record<string | symbol, any>;
        // Set up activators to activate this node as being used in React
        extraPrimitiveActivators.set('$$typeof', true);
        extraPrimitiveActivators.set(Symbol.toPrimitive, true);

        // eslint-disable-next-line no-inner-declarations
        function set(key, value) {
            s.set(key, value);
            proto[key] = { configurable: true, value };
        }
        set('$$typeof', ReactTypeofSymbol);
        set('type', Text);
        set('_store', { validated: true });
        set('key', null);
        set('ref', null);
        set('alternate', null);
        set('_owner', null);
        set('_source', null);

        // Set extra props for the proxyHandler to return on primitives
        s.set(Symbol.toPrimitive, (_: any, value: any) => value);
        s.set('props', (obs: any) => ({ data: obs }));
        // Set extra props for ObservablePrimitive to return on primitives
        proto[Symbol.toPrimitive] = {
            configurable: true,
            get() {
                return this.peek();
            },
        };
        proto.props = {
            configurable: true,
            get() {
                return { data: this };
            },
        };

        Object.defineProperties(ObservablePrimitiveClass.prototype, proto);
    }
}
