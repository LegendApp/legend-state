import { configureLegendState, internal, NodeValue } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

export function enableReactUse() {
    configureLegendState({
        observableFunctions: {
            use: (node: NodeValue) => useSelector(internal.getProxy(node)),
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ObservableBaseFns } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ObservableBaseFns<T> {
        use(): T;
    }
}
