import { configureLegendState, internal } from '@legendapp/state';

export function enableDirectPeek() {
    configureLegendState({
        observableProperties: {
            _: {
                get(node) {
                    return internal.peek(node);
                },
                set(node, value) {
                    if (node.parent) {
                        internal.ensureNodeValue(node);
                        const parentValue = internal.peek(node.parent);
                        parentValue[node.key] = value;
                        return value;
                    } else {
                        node.root._ = value;
                    }
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
        _: T;
    }
}
