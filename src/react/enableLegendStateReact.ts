import {
    extraPrimitiveActivators,
    extraPrimitiveProps,
    ObservablePrimitiveClass,
    ObservableReadable,
} from '@legendapp/state';
import { createElement, memo } from 'react';
import { hasSymbol } from './reactive-observer';
import { useSelector } from './useSelector';
let isEnabled = false;

// TODOV2 Delete this file
export function enableLegendStateReact() {
    if (process.env.NODE_ENV === 'development') {
        console.warn(
            '[legend-state] enableLegendStateReact is deprecated and will be removed in version 2.0. Please convert it from {value} to <Memo>{value}</Memo>. See https://legendapp.com/open-source/state/migrating for more details.',
        );
    }
    if (!isEnabled) {
        isEnabled = true;

        // Rendering observables directly inspired by Preact Signals: https://github.com/preactjs/signals/blob/main/packages/react/src/index.ts
        // Add the extra primitive props so that observables can render directly
        // Memoized component to wrap the observable value
        const Text = memo(function Text({ data }: { data: ObservableReadable }) {
            return useSelector(data);
        });

        const ReactTypeofSymbol = hasSymbol ? Symbol.for('react.element') : (createElement('a') as any).$$typeof;

        const s = extraPrimitiveProps;
        const proto = {} as Record<string | symbol, any>;
        // Set up activators to activate this node as being used in React
        extraPrimitiveActivators.set('$$typeof', true);
        extraPrimitiveActivators.set(Symbol.toPrimitive, true);

        // eslint-disable-next-line no-inner-declarations
        function set(key: string, value: any) {
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
