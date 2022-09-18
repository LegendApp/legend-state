import { isFunction, isObservable, Observable } from '@legendapp/state';

export type Selector<T> = Observable<T> | (() => T);

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
