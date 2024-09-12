import { internal, NodeInfo } from '@legendapp/state';
import { configureLegendState } from '@legendapp/state/config/configureLegendState';
import { useSelector, UseSelectorOptions } from '@legendapp/state/react';

// TODO: Deprecated, remove in v4
let didWarn = false;

export function enableReactUse() {
    configureLegendState({
        observableFunctions: {
            use: (node: NodeInfo, options?: UseSelectorOptions) => {
                if (process.env.NODE_ENV === 'development' && !didWarn) {
                    didWarn = true;
                    console.warn(
                        '[legend-state] enableReactUse() is deprecated. Please switch to using get() with observer, which is safer and more efficient. See https://legendapp.com/open-source/state/v3/react/react-api/',
                    );
                }
                return useSelector(internal.getProxy(node), options);
            },
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ImmutableObservableBase } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ImmutableObservableBase<T> {
        use(options?: UseSelectorOptions): T;
    }
}
