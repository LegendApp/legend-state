import { internal } from '@legendapp/state';
import { configureLegendState } from '@legendapp/state/config/configureLegendState';

export function enable_PeekAssign() {
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

// TODOv4 deprecate
export const enableDirectAccess = enable_PeekAssign;

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ImmutableObservableBase } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ImmutableObservableBase<T> {
        get _(): T;
        set _(value: T | null | undefined);
    }
}
