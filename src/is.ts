import type { ChildNodeValue, NodeValue } from './observableInterfaces';

export const hasOwnProperty = Object.prototype.hasOwnProperty;

export function isArray(obj: unknown): obj is Array<any> {
    return Array.isArray(obj);
}
export function isString(obj: unknown): obj is string {
    return typeof obj === 'string';
}
export function isObject(obj: unknown): obj is Record<any, any> {
    return !!obj && typeof obj === 'object' && !(obj instanceof Date) && !isArray(obj);
}
export function isFunction(obj: unknown): obj is Function {
    return typeof obj === 'function';
}
export function isPrimitive(arg: unknown): arg is string | number | bigint | boolean | symbol {
    const type = typeof arg;
    return arg !== undefined && (isDate(arg) || (type !== 'object' && type !== 'function'));
}
export function isDate(obj: unknown): obj is Date {
    return obj instanceof Date;
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
    // Looping and returning false on the first property is faster than Object.keys(obj).length === 0
    // https://jsbench.me/qfkqv692c8
    if (!obj) return false;
    if (isArray(obj)) return obj.length === 0;
    for (const key in obj) {
        if (hasOwnProperty.call(obj, key)) {
            return false;
        }
    }
    return true;
}
export function isNullOrUndefined(value: any): value is undefined | null {
    return value === undefined || value === null;
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
