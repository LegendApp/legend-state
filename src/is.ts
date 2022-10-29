import type { NodeValue, RootNodeValue, ChildNodeValue } from './observableInterfaces';

/** @internal */
export function isArray(obj: unknown): obj is Array<any> {
    return Array.isArray(obj);
}
/** @internal */
export function isString(obj: unknown): obj is string {
    return typeof obj === 'string';
}
/** @internal */
export function isObject(obj: unknown): obj is Record<any, any> {
    return !!obj && typeof obj === 'object' && !isArray(obj);
}
/** @internal */
export function isFunction(obj: unknown): obj is Function {
    return typeof obj === 'function';
}
/** @internal */
export function isPrimitive(arg: unknown): arg is string | number | bigint | boolean | symbol {
    const type = typeof arg;
    return arg !== undefined && type !== 'object' && type !== 'function';
}
/** @internal */
export function isObjectEmpty(obj: object) {
    return obj && typeof obj === 'object' && Object.keys(obj).length === 0;
}
/** @internal */
export function isSymbol(obj: unknown): obj is symbol {
    return typeof obj === 'symbol';
}
/** @internal */
export function isBoolean(obj: unknown): obj is boolean {
    return typeof obj === 'boolean';
}
/** @internal */
export function isPromise<T>(obj: unknown): obj is Promise<T> {
    return obj instanceof Promise;
}
export function isEmpty(obj: object): boolean {
    return obj && Object.keys(obj).length === 0;
}
const setPrimitives = new Set([
    'boolean',
    'string',
    'number',
]);
/** @internal */
export function isActualPrimitive(arg: unknown): arg is boolean | string | number {
    return setPrimitives.has(typeof arg);
}
/** @internal */
export function isChildNodeValue(node: NodeValue): node is ChildNodeValue {
    return !!node.parent;
}
