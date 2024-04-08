import { configureLegendState, internal } from '@legendapp/state';

export function enable$Get() {
    configureLegendState({
        observableProperties: {
            $: {
                get(node) {
                    return internal.get(node);
                },
                set(node, value) {
                    internal.set(node, value);
                },
            },
        },
    });
}
// TODOv4 deprecate
export const enableDirectAccess = enable$Get;

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ImmutableObservableBase } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ImmutableObservableBase<T> {
        get $(): T;
        set $(value: T | null | undefined);
    }
}
