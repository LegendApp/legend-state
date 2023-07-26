import { configureLegendState, internal } from '@legendapp/state';

export function enableDirectPeek() {
    configureLegendState({
        observableProperties: {
            _: {
                get(node) {
                    return internal.peek(node);
                },
                set(node, value) {
                    internal.setNodeValue(node, value);
                },
            },
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ObservableBaseFns } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ObservableBaseFns<T> {
        set _(value: T | null | undefined);
        get _(): T;
    }
}
