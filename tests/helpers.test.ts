import { symbolDelete } from '../internal';
import { isObservable, mergeIntoObservable } from '../src/helpers';
import { observable } from '../src/observable';

describe('mergeIntoObservable', () => {
    it('should merge two plain objects', () => {
        const target = { a: 1, b: 2 };
        const source = { b: 3, c: 4 };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(false);
    });

    it('should merge two observable objects', () => {
        const target = observable({ a: 1, b: 2 });
        const source = observable({ b: 3, c: 4 });
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(true);
    });

    it('should merge a plain object and an observable object', () => {
        const target = { a: 1, b: 2 };
        const source = observable({ b: 3, c: 4 });
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(false);
    });

    it('should delete a key marked with symbolDelete', () => {
        const target = { a: 1, b: 2 };
        const source = { b: symbolDelete };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1 });
        expect(isObservable(merged)).toBe(false);
    });
});
