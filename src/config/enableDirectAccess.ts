import { configureLegendState, internal, updateTracking } from '@legendapp/state';

export function enableDirectAccess() {
    configureLegendState({
        observableProperties: {
            $: {
                get(node) {
                    updateTracking(node);
                    return internal.peek(node);
                },
                set(node, value) {
                    return internal.set(node, value);
                },
            },
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ObservablePrimitive } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ObservablePrimitive<T> {
        set $(value: T | null | undefined);
        get $(): T;
    }
}
