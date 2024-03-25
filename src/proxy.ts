import { computed } from './computed';
import { observable } from './observable';
import { Observable, ObservableWriteable } from './observableTypes';

// Deprecated. Remove in v4

export function proxy<T, T2 = T>(
    get: (key: string) => T,
    set: (key: string, value: T2) => void,
): Observable<Record<string, T>>;
export function proxy<T extends Record<string, any>>(
    get: <K extends keyof T>(key: K) => ObservableWriteable<T[K]>,
): Observable<T>;
export function proxy<T>(get: (key: string) => ObservableWriteable<T>): Observable<Record<string, T>>;
export function proxy<T>(get: (key: string) => T): Observable<Record<string, T>>;
export function proxy<T extends Record<string, any>, T2 = T>(
    get: (key: any) => ObservableWriteable<any>,
    set?: (key: any, value: T2) => void,
): any {
    return observable((key: string) =>
        computed({ get: () => get(key), set: set ? ({ value }: any) => set!(key, value) : undefined }),
    );
}
