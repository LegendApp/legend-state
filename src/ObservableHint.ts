import { symbolOpaque, symbolPlain } from './globals';
import type { OpaqueObject, PlainObject } from './observableInterfaces';

function addSymbol<T>(value: object, symbol: symbol) {
    if (value) {
        Object.defineProperty(value, symbol, {
            value: true,
            enumerable: false,
            writable: true,
            configurable: true,
        });
    }
    return value as T;
}

export const ObservableHint = {
    opaque: function opaqueObject<T extends object>(value: T): OpaqueObject<T> {
        return addSymbol(value, symbolOpaque);
    },
    plain: function plainObject<T extends object>(value: T): PlainObject<T> {
        return addSymbol(value, symbolPlain);
    },
    function: function plainObject<T extends object>(value: T): PlainObject<T> {
        return addSymbol(value, symbolPlain);
    },
};
