import {
    extraPrimitiveActivators,
    extraPrimitiveProps,
    getNode,
    internal,
    isObservable,
    ObservablePrimitiveClass,
    ObservableReadable,
} from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { createElement, memo } from 'react';
let isEnabled = false;

function getNodePath(node: NodeValue) {
    const arr: (string | number)[] = [];
    let n = node;
    while (n?.key !== undefined) {
        arr.splice(0, 0, n.key);
        n = n.parent;
    }
    return arr.join('.');
}

// Extracting the forwardRef inspired by https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/observer.ts
export const hasSymbol = /* @__PURE__ */ typeof Symbol === 'function' && Symbol.for;

export function enableReactDirectRender() {
    if (process.env.NODE_ENV === 'development' && !internal.globalState.noWarnings) {
        console.warn(
            '[legend-state] enableReactDirectRender is deprecated and will be removed in version 2.0. Please convert it from {value} to <Memo>{value}</Memo>. See https://legendapp.com/open-source/state/migrating for more details.',
        );
    }
    if (!isEnabled) {
        isEnabled = true;

        // Rendering observables directly inspired by Preact Signals: https://github.com/preactjs/signals/blob/main/packages/react/src/index.ts
        // Add the extra primitive props so that observables can render directly
        // Memoized component to wrap the observable value
        const Text = memo(function Text({ data }: { data: ObservableReadable }) {
            if (process.env.NODE_ENV === 'development' && !internal.globalState.noWarnings) {
                if (isObservable(data)) {
                    console.warn(
                        `[legend-state] enableLegendStateReact is deprecated and will be removed in version 2.0. Please convert rendering of observable with path ${getNodePath(
                            getNode(data),
                        )} to <Memo>{value}</Memo>. See https://legendapp.com/open-source/state/migrating for more details.`,
                    );
                }
            }
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

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NodeValue } from '@legendapp/state';
import type { ReactFragment } from 'react';

declare module '@legendapp/state' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unused-vars
    interface ObservableBaseFns<T> extends ReactFragment {}
}
