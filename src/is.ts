export function isArray(obj: unknown): obj is Array<any> {
    return Array.isArray(obj);
}
export function isString(obj: unknown): obj is string {
    return typeof obj === 'string';
}
export function isObject(obj: unknown): obj is Record<any, any> {
    return typeof obj === 'object' && obj !== null && !isArray(obj);
}
export function isFunction(obj: unknown): obj is Function {
    return typeof obj === 'function';
}
export function isPrimitive(arg) {
    var type = typeof arg;
    return arg == null || (type != 'object' && type != 'function');
}
export function isObjectEmpty(obj: object) {
    return obj && isObject(obj) && Object.keys(obj).length === 0;
}
