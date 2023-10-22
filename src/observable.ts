import { createObservable } from './createObservable';
import { extractPromise, getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import type {
    ComputedParams,
    ComputedProxyParams,
    Observable,
    ObservableComputed,
    ObservablePrimitive,
    RecordValue,
    WithState,
} from './observableInterfaces';
import { globalState } from './globals';
import { when } from './when';
import { batch } from './batching';

type TWithFunctions<T> =
    | T
    | {
          [K in keyof T]:
              | ((
                    params: ComputedProxyParams<T[K] | RecordValue<T[K]>>,
                ) => TWithFunctions<T[K]> | Promise<TWithFunctions<T[K]>> | void)
              | TWithFunctions<T[K]>;
      };

export function observable<T>(value: Promise<T>): Observable<T & WithState>;
export function observable<T>(value: () => Observable<T>): Observable<T>;
export function observable<T>(value: () => T): ObservableComputed<T>;
export function observable<T>(value: (params: ComputedParams) => Observable<T>): Observable<T>;
export function observable<T>(value: (params: ComputedParams) => T): Observable<T>;
export function observable<T>(value: (params: ComputedProxyParams<T>) => void): Observable<Record<string, T>>;
export function observable<T>(value?: TWithFunctions<T>): Observable<T>;
export function observable<T>(value?: T): any {
    return createObservable(value, false, extractPromise, getProxy, ObservablePrimitiveClass) as Observable<any>;
}

export function observablePrimitive<T>(value: Promise<T>): ObservablePrimitive<T & WithState>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T & WithState> {
    return createObservable(value, true, extractPromise, getProxy, ObservablePrimitiveClass) as ObservablePrimitive<
        T & WithState
    >;
}

globalState.isLoadingRemote$ = observable(false);
globalState.onChangeRemote = function onChangeRemote(cb: () => void) {
    when(
        () => !globalState.isLoadingRemote$.get(),
        () => {
            // Remote changes should only update local state
            globalState.isLoadingRemote$.set(true);

            batch(cb, () => {
                globalState.isLoadingRemote$.set(false);
            });
        },
    );
};
