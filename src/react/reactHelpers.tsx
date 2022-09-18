import { isFunction, isObservable } from '@legendapp/state';
import type { ObservablePrimitive } from '../ObservablePrimitive';

export type Selector<T> = ObservablePrimitive<T> | (() => T);

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
