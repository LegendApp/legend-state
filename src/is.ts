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
    return typeof obj === 'object' && obj !== null && !isArray(obj);
}
/** @internal */
export function isFunction(obj: unknown): obj is Function {
    return typeof obj === 'function';
}
/** @internal */
export function isPrimitive(arg) {
    var type = typeof arg;
    return arg == null || (type != 'object' && type != 'function');
}
/** @internal */
export function isObjectEmpty(obj: object) {
    return obj && isObject(obj) && Object.keys(obj).length === 0;
}
/** @internal */
export function isSymbol(obj: unknown): obj is symbol {
    return typeof obj === 'symbol';
}
/** @internal */
export function isBoolean(obj: unknown): obj is boolean {
    return obj === true || obj === false;
}
