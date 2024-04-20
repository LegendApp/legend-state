import { symbolLinked } from './globals';
import { Linked, LinkedOptions } from './observableInterfaces';

export function linked<T>(params: LinkedOptions<T>): Linked<T> {
    return (() => ({ [symbolLinked]: params })) as any;
}
