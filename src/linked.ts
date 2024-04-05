import { symbolLinked } from './globals';
import { LinkedParams } from './observableInterfaces';

export function linked<T>(params: LinkedParams<T>): T {
    return (() => ({ [symbolLinked]: params })) as any;
}
