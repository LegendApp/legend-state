import { symbolBound } from './globals';
import { ComputedParams } from './observableInterfaces';

export function linked<T>(params: ComputedParams<T>): T {
    return (() => ({ [symbolBound]: params })) as any;
}
