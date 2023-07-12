import { computed } from './computed';
import { createObservable } from './createObservable';
import { event } from './event';
import { optimized } from './globals';
import { opaqueObject } from './helpers';
import { isFunction } from './is';
import type {
    ComputedOptions,
    Observable,
    ObservableComputed,
    ObservableComputedTwoWay,
    ObservablePrimitive,
    ObservableReadable,
} from './observableInterfaces';
import { proxy } from './proxy';

function observableConstructor<T, T2>(
    value?: T | Promise<T> | (() => T),
    set?: (value: T2) => void,
    options?: ComputedOptions
): Observable<T> | ObservableComputed<T> {
    return isFunction(value) ? computed(value, set, options) : (createObservable(value) as Observable<T>);
}

export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T> {
    return createObservable<T>(value, /*makePrimitive*/ true);
}

observableConstructor.proxy = proxy;
observableConstructor.event = event;
observableConstructor.opaque = opaqueObject;
observableConstructor.primitive = observablePrimitive;
observableConstructor.computed = computed;
observableConstructor.optimized = optimized;

declare class ObservableClass {
    static computed(...args: Parameters<typeof computed>): ReturnType<typeof computed>;
    static event(...args: Parameters<typeof event>): ReturnType<typeof event>;
    static opaque(...args: Parameters<typeof opaqueObject>): ReturnType<typeof opaqueObject>;
    static primitive(...args: Parameters<typeof observablePrimitive>): ReturnType<typeof observablePrimitive>;
    static proxy(...args: Parameters<typeof proxy>): ReturnType<typeof proxy>;
    static optimized: typeof optimized;
}

type IObservable = typeof ObservableClass & {
    <T>(value: undefined, options?: ComputedOptions): Observable<T>;
    <T extends ObservableReadable>(compute: () => T | Promise<T>, options?: ComputedOptions): T;
    <T>(compute: () => T | Promise<T>, options?: ComputedOptions): ObservableComputed<T>;
    <T, T2 = T>(
        compute: (() => T | Promise<T>) | ObservableReadable<T>,
        set: (value: T2) => void,
        options?: ComputedOptions
    ): ObservableComputedTwoWay<T, T2>;
    <T>(value?: T | Promise<T>, options?: ComputedOptions): Observable<T>;
};

export const observable: IObservable = observableConstructor as unknown as IObservable;
