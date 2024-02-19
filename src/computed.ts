import { activated } from './activated';
import { observable } from './observable';
import { ObservableComputed, ObservableComputedTwoWay, ObservableReadable } from './observableTypes';

export function computed<T extends ObservableReadable>(compute: () => T | Promise<T>): T;
export function computed<T>(compute: () => T | Promise<T>): ObservableComputed<T>;
export function computed<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set: (value: T2) => void,
): ObservableComputedTwoWay<T, T2>;
export function computed<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set?: (value: T2) => void,
): ObservableComputed<T> | ObservableComputedTwoWay<T, T2> {
    // @ts-expect-error asdf
    return observable(
        set
            ? activated({
                  // @ts-expect-error asdf
                  get: compute,
                  onSet: ({ value }) => set(value as any),
              })
            : compute,
    );
}
