import { symbolLinked } from './globals';
import { observable } from './observable';
import { LinkedParams } from './observableInterfaces';
import { Observable, ObservableParam, RecursiveValueOrFunction } from './observableTypes';

export function computed<T>(get: () => RecursiveValueOrFunction<T>): Observable<T>;
export function computed<T, T2 = T>(
    get: (() => RecursiveValueOrFunction<T>) | RecursiveValueOrFunction<T>,
    set: (value: T2) => void,
): Observable<T>;
export function computed<T, T2 = T>(
    get: (() => T | Promise<T>) | ObservableParam<T> | LinkedParams<T>,
    set?: (value: T2) => void,
): Observable<T> {
    return observable(set ? () => ({ [symbolLinked]: { get, set: ({ value }: any) => set(value) } }) : get) as any;
}
