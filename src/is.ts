import type { ChildNodeValue, NodeValue } from './observableInterfaces';

export function isArray(obj: unknown): obj is Array<any> {
    return Array.isArray(obj);
}
export function isString(obj: unknown): obj is string {
    return typeof obj === 'string';
}
export function isObject(obj: unknown): obj is Record<any, any> {
    return !!obj && typeof obj === 'object' && !isArray(obj);
}
// eslint-disable-next-line @typescript-eslint/ban-types
export function isFunction(obj: unknown): obj is Function {
    return typeof obj === 'function';
}
export function isPrimitive(arg: unknown): arg is string | number | bigint | boolean | symbol {
    const type = typeof arg;
    return arg !== undefined && type !== 'object' && type !== 'function';
}
export function isSymbol(obj: unknown): obj is symbol {
    return typeof obj === 'symbol';
}
export function isBoolean(obj: unknown): obj is boolean {
    return typeof obj === 'boolean';
}
export function isPromise<T>(obj: unknown): obj is Promise<T> {
    return obj instanceof Promise;
}
export function isEmpty(obj: object): boolean {
    return obj && Object.keys(obj).length === 0;
}
const setPrimitives = new Set(['boolean', 'string', 'number']);
/** @internal */
export function isActualPrimitive(arg: unknown): arg is boolean | string | number {
    return setPrimitives.has(typeof arg);
}
/** @internal */
export function isChildNodeValue(node: NodeValue): node is ChildNodeValue {
    return !!node.parent;
}
