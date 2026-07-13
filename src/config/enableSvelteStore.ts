import { internal, NodeInfo } from '@legendapp/state';
import { configureLegendState } from '@legendapp/state/config';

type Subscriber<T> = (value: T) => void;
type Unsubscriber = () => void;
type Updater<T> = (value: T) => T;

export function enableSvelteStore() {
    configureLegendState({
        observableFunctions: {
            subscribe: (node: NodeInfo, run: Subscriber<any>): Unsubscriber => {
                const proxy = internal.getProxy(node);
                run(proxy.get());
                return proxy.onChange(({ value }) => run(value));
            },
            update: (node: NodeInfo, updater: Updater<any>) => {
                internal.getProxy(node).set(updater);
            },
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ImmutableObservableBase } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ImmutableObservableBase<T> {
        subscribe(this: void, run: Subscriber<T>): Unsubscriber;
        update(this: void, updater: Updater<T>): void;
    }
}
