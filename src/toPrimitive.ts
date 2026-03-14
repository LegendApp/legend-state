import { peek } from './ObservableObject';
import { isFunction, isPrimitive } from './is';
import type { NodeInfo } from './observableInterfaces';

export function toPrimitive(node: NodeInfo, hint: string) {
    const value = peek(node);
    if (value === null || value === undefined || isPrimitive(value)) {
        return value;
    }

    const method =
        hint === 'string'
            ? (isFunction(value.toString) ? value.toString : value.valueOf)
            : (isFunction(value.valueOf) ? value.valueOf : value.toString);

    return isFunction(method) ? method.call(value) : value;
}
