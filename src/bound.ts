import type { Observable } from './observableTypes';
import { symbolBound } from './globals';
import { observable } from './observable';
import { BoundParams } from './observableInterfaces';

export function bound<T>(params: BoundParams<T>): Observable<T> {
    return observable(() => ({
        [symbolBound]: params,
    })) as any;
}
