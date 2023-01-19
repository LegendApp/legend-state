import { extraPrimitiveProps, getNode, ObservablePrimitiveClass, ObservableReadable } from '@legendapp/state';
import { createElement, memo } from 'react';
import { hasSymbol } from './reactive-observer';
import { useSelector } from './useSelector';
let isEnabled = false;

export function enableLegendStateReact() {
    if (!isEnabled) {
        isEnabled = true;

        // Rendering observables directly inspired by Preact Signals: https://github.com/preactjs/signals/blob/main/packages/react/src/index.ts
        // Add the extra primitive props so that observables can render directly
        // Memoized component to wrap the observable value
        const Text = memo(function Text({ data }: { data: ObservableReadable }) {
            const value = useSelector(data);

            const root = getNode(data).root;
            const activate = root.activate;
            if (activate) {
                root.activate = undefined;
                activate();
            }

            return value;
        });

        const ReactTypeofSymbol = hasSymbol ? Symbol.for('react.element') : (createElement('a') as any).$$typeof;

        const s = extraPrimitiveProps;
        // Set extra props for the proxyHandler to return on primitives
        s.set(Symbol.toPrimitive, (_: any, value: any) => value);
        s.set('props', {
            __fn: (obs: any) => ({ data: obs }),
        });
        s.set('$$typeof', ReactTypeofSymbol);
        s.set('type', Text);
        s.set('_store', { validated: true });
        s.set('key', null);
        s.set('ref', null);
        s.set('alternate', null);
        s.set('_owner', null);
        s.set('_source', null);
        const config = (value: any) => ({ configurable: true, value });
        // Set extra props for ObservablePrimitive to return on primitives
        Object.defineProperties(ObservablePrimitiveClass.prototype, {
            [Symbol.toPrimitive]: {
                configurable: true,
                get() {
                    return this.peek();
                },
            },
            props: {
                configurable: true,
                get() {
                    return { data: this };
                },
            },
            $$typeof: config(ReactTypeofSymbol),
            type: config(Text),
            _store: config({ validated: true }),
            ref: config(null),
            alternate: config(null),
            _owner: config(null),
            _source: config(null),
        });
    }
}
