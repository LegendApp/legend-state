import { extractPromise, getProxy } from './ObservableObject';
import { ObservablePrimitiveClass } from './ObservablePrimitive';
import { createObservable } from './createObservable';
import type { Observable, ObservablePrimitive, RecursiveValueOrFunction } from './observableTypes';

/**
 * Create an observable from an initial value.
 *
 * **Important:** when `value` is a plain object or array, it is stored **by reference** and
 * mutated in place as fields are updated via `.set()`. After the first child set, the
 * variable you passed in no longer holds the original state — it holds the current state.
 *
 * This is intentional (it's how Legend State avoids cloning on every update), but it
 * surprises people coming from Zustand/Redux/MobX. The most common gotcha is using a
 * shared `initialState` constant as a "reset target":
 *
 * ```ts
 * const initialState = { count: 0 };
 * const store$ = observable(initialState);
 *
 * store$.count.set(5);
 * console.log(initialState); // { count: 5 } ← mutated in place
 *
 * store$.set(initialState);  // ❌ no-op: structurally equal to current value
 * ```
 *
 * If you want a stable "reset target", pass a fresh object/literal each time — typically
 * via a factory:
 *
 * ```ts
 * const createInitialState = () => ({ count: 0 });
 * const store$ = observable(createInitialState());
 * store$.set(createInitialState()); // ✅ fresh object, set fires
 * ```
 */
export function observable<T>(): Observable<T | undefined>;
export function observable<T>(
    value: Promise<RecursiveValueOrFunction<T>> | (() => RecursiveValueOrFunction<T>) | RecursiveValueOrFunction<T>,
): Observable<T>;
export function observable<T>(value: T): Observable<T>;
export function observable<T>(value?: T): Observable<any> {
    return createObservable(value, false, extractPromise, getProxy, ObservablePrimitiveClass) as any;
}

export function observablePrimitive<T>(value: Promise<T>): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T): ObservablePrimitive<T>;
export function observablePrimitive<T>(value?: T | Promise<T>): ObservablePrimitive<T> {
    return createObservable(value, true, extractPromise, getProxy, ObservablePrimitiveClass) as any;
}
