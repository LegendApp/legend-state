import { linked } from './linked';
import { observable } from './observable';
import { Observable, ObservableParam } from './observableTypes';

// Deprecated. Remove in v4

export function proxy<T, T2 = T>(
    get: (key: string) => T,
    set: (key: string, value: T2) => void,
): Observable<Record<string, T>>;
export function proxy<T extends Record<string, any>>(
    get: <K extends keyof T>(key: K) => ObservableParam<T[K]>,
): Observable<T>;
export function proxy<T>(get: (key: string) => ObservableParam<T>): Observable<Record<string, T>>;
export function proxy<T>(get: (key: string) => T): Observable<Record<string, T>>;
export function proxy<T extends Record<string, any>, T2 = T>(
    get: (key: any) => ObservableParam<any>,
    set?: (key: any, value: T2) => void,
): any {
    return observable((key: string) =>
        set
            ? linked({
                  get: () => get(key),
                  set: ({ value }) => set(key, value as any),
              })
            : get(key),
    );
}
