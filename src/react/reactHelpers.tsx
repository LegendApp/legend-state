import { isFunction, isObservable, ObservableReadable } from '@legendapp/state';

export type Selector<T> = ObservableReadable<T> | (() => T);

export function computeSelector<T>(selector: Selector<T>) {
    let c = selector as any;
    if (isFunction(c)) {
        c = c();
    }

    if (isObservable(c)) {
        c = c.get();
    }

    return c;
}
