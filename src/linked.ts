import { symbolLinked } from './globals';
import { isFunction } from './is';
import type { Linked, LinkedOptions } from './observableInterfaces';

export function linked<T>(params: LinkedOptions<T> | (() => T), options?: LinkedOptions<T>): Linked<T> {
    if (isFunction(params)) {
        params = { get: params };
    }
    if (options) {
        params = { ...params, ...options };
    }
    const ret = function () {
        return { [symbolLinked]: params };
    };
    ret.prototype[symbolLinked] = params;
    return ret as Linked<T>;
}
