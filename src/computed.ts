import { BoundParams } from 'src/observableInterfaces';
import { symbolBound } from './globals';
import { isObject } from './is';
import { observable } from './observable';
import { Observable, ObservableReadable, RecursiveValueOrFunction } from './observableTypes';

export function computed<T>(get: BoundParams<T>): Observable<T>;
export function computed<T>(get: (() => RecursiveValueOrFunction<T>) | RecursiveValueOrFunction<T>): Observable<T>;
export function computed<T, T2 = T>(
    get: (() => RecursiveValueOrFunction<T>) | RecursiveValueOrFunction<T>,
    set: (value: T2) => void,
): Observable<T>;
export function computed<T, T2 = T>(
    get: (() => T | Promise<T>) | ObservableReadable<T> | BoundParams<T>,
    set?: (value: T2) => void,
): Observable<T> {
    const bound = isObject(get) ? get : set ? { get, set: ({ value }: any) => set(value) } : false;
    return observable(bound ? () => ({ [symbolBound]: bound }) : get) as any;
}
