import type { ChildNodeInfo, NodeInfo } from './observableInterfaces';

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
export function isPlainObject(obj: unknown): obj is Record<any, any> {
    return isObject(obj) && obj.constructor === Object;
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
export function isMap(obj: unknown): obj is Map<any, any> {
    return obj instanceof Map || obj instanceof WeakMap;
}
export function isSet(obj: unknown): obj is Set<any> {
    return obj instanceof Set || obj instanceof WeakSet;
}
export function isNumber(obj: unknown): obj is number {
    const n = obj as number;
    return typeof n === 'number' && n - n < 1;
}
export function isEmpty(obj: object): boolean {
    // Looping and returning false on the first property is faster than Object.keys(obj).length === 0
    // https://jsbench.me/qfkqv692c8
    if (!obj) return false;
    if (isArray(obj)) return obj.length === 0;
    if (isMap(obj) || isSet(obj)) return obj.size === 0;
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
export function isChildNode(node: NodeInfo): node is ChildNodeInfo {
    return !!node.parent;
}
