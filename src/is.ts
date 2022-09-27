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
    return obj && typeof obj === 'object' && !isArray(obj);
}
/** @internal */
export function isFunction(obj: unknown): obj is Function {
    return typeof obj === 'function';
}
/** @internal */
export function isPrimitive(arg) {
    var type = typeof arg;
    return arg !== undefined && arg !== null && type != 'object' && type != 'function';
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
    return obj === true || obj === false;
}
/** @internal */
export function isPromise<T>(obj: unknown): obj is Promise<T> {
    return isFunction((obj as any)?.then) && isFunction((obj as any).catch);
}
export function isEmpty(obj: object) {
    return obj && Object.keys(obj).length === 0;
}
const mapPrimitives = new Map([
    ['boolean', true],
    ['string', true],
    ['number', true],
]);
/** @internal */
export function isActualPrimitive(arg) {
    return mapPrimitives.has(typeof arg);
}
