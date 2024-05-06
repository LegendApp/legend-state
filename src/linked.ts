import { isFunction } from './is';
import { symbolLinked } from './globals';
import { Linked, LinkedOptions } from './observableInterfaces';

export function linked<T>(params: LinkedOptions<T> | (() => T)): Linked<T> {
    if (isFunction(params)) {
        params = { get: params };
    }
    return (() => ({ [symbolLinked]: params })) as any;
}
