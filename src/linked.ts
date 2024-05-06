import { isFunction } from './is';
import { symbolLinked } from './globals';
import { Linked, LinkedOptions } from './observableInterfaces';

export function linked<T>(params: LinkedOptions<T> | (() => T)): Linked<T> {
    if (isFunction(params)) {
        params = { get: params };
    }
    const ret = function () {
        return { [symbolLinked]: params };
    };
    ret.prototype[symbolLinked] = params;
    return ret as Linked<T>;
}
