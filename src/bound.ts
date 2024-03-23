import { symbolBound } from './globals';
import { Bound, BoundParams } from './observableInterfaces';

export function bound<T>(params: BoundParams<T>): Bound<T> {
    return (() => ({
        [symbolBound]: params,
    })) as any;
}
