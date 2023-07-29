import { configureLegendState, internal, NodeValue } from '@legendapp/state';
import { useSelector, UseSelectorOptions } from '@legendapp/state/react';

export function enableReactUse() {
    configureLegendState({
        observableFunctions: {
            use: (node: NodeValue, options?: UseSelectorOptions) => useSelector(internal.getProxy(node), options),
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ObservableBaseFns } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ObservableBaseFns<T> {
        use(options?: UseSelectorOptions): T;
    }
}
