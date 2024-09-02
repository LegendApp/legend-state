import { symbolOpaque, symbolPlain } from './globals';
import type { OpaqueObject, PlainObject } from './observableInterfaces';

function addSymbol<T>(value: object, symbol: symbol) {
    if (value) {
        (value as any)[symbol] = true;
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
};
