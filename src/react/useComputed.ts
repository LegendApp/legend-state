import { isArray, linked, Observable, ObservableParam } from '@legendapp/state';
import { useObservable } from './useObservable';

// TODO: Deprecate this?
export function useComputed<T>(get: () => T | Promise<T>): Observable<T>;
export function useComputed<T>(get: () => T | Promise<T>, deps: any[]): Observable<T>;
export function useComputed<T, T2 = T>(
    get: (() => T | Promise<T>) | ObservableParam<T>,
    set: (value: T2) => void,
): Observable<T>;
export function useComputed<T, T2 = T>(
    get: (() => T | Promise<T>) | ObservableParam<T>,
    set: (value: T2) => void,
    deps: any[],
): Observable<T>;
export function useComputed<T, T2 = T>(
    get: (() => T | Promise<T>) | ObservableParam<T>,
    set?: ((value: T2) => void) | any[],
    deps?: any[],
): Observable<T> {
    if (!deps && isArray(set)) {
        deps = set;
        set = undefined;
    }
    return useObservable<T>(
        set ? (linked({ get: get as () => T, set: ({ value }) => (set as (value: any) => void)(value) }) as any) : get,
        deps,
    );
}
