import { symbolLinked } from './globals';
import { Linked, LinkedParams } from './observableInterfaces';

export function linked<T>(params: LinkedParams<T>): Linked<T> {
    return (() => ({ [symbolLinked]: params })) as any;
}
