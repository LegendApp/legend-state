import { configureLegendState, internal, type NodeValue } from '@legendapp/state';

export function enableDirectAccess() {
    const { observableFns, set } = internal;
    configureLegendState({
        observableProperties: {
            $: {
                get(node) {
                    // Get it from the observableFns Map because another config function
                    // might have overriden get
                    const get = observableFns.get('get') as (node: NodeValue) => any;
                    return get(node);
                },
                set(node, value) {
                    return set(node, value);
                },
            },
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ImmutableObservableBase } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ImmutableObservableBase<T> {
        set $(value: T | null | undefined);
        get $(): T;
    }
}
