import { symbolDelete } from '../internal';
import { isObservable, isObservableValueReady, mergeIntoObservable } from '../src/helpers';
import { observable } from '../src/observable';

describe('mergeIntoObservable', () => {
    test('merge onto empty object', () => {
        const target = {};
        const source = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: { b: { c: { d: 5 } } } });
        expect(isObservable(merged)).toBe(false);
    });
    test('merge onto empty observable', () => {
        const target = observable();
        const source = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: { b: { c: { d: 5 } } } });
        expect(isObservable(merged)).toBe(true);
    });
    test('should merge two plain objects', () => {
        const target = { a: 1, b: 2 };
        const source = { b: 3, c: 4 };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(false);
    });
    test('should merge two observable objects', () => {
        const target = observable({ a: 1, b: 2 });
        const source = observable({ b: 3, c: 4 });
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(true);
    });
    test('should merge a plain object and an observable object', () => {
        const target = observable({ a: 1, b: 2 });
        const source = { b: 3, c: 4 };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4 });
        expect(isObservable(merged)).toBe(true);
    });
    test('should delete a key marked with symbolDelete', () => {
        const target = { a: 1, b: 2 };
        const source = { b: symbolDelete };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: 1 });
        expect(isObservable(merged)).toBe(false);
    });
    test('should not merge undefined with sparse array', () => {
        const target = {
            id: {
                panes: [
                    {
                        item: 'a',
                    },
                    {
                        item: 'a',
                    },
                    {
                        item: 'a',
                    },
                ],
            },
        };
        const panes = [];
        panes[1] = {
            item: 'B',
        };
        const source = {
            id: {
                panes,
            },
        };

        mergeIntoObservable(target, source);
        expect(target).toEqual({
            id: {
                panes: [
                    {
                        item: 'a',
                    },
                    {
                        item: 'B',
                    },
                    {
                        item: 'a',
                    },
                ],
            },
        });
    });
});

describe('isObservableValueReady', () => {
    test('returns false for empty objects', () => {
        expect(isObservableValueReady({})).toBe(false);
    });

    test('returns false for empty arrays', () => {
        expect(isObservableValueReady([])).toBe(false);
    });

    test('returns false for null values', () => {
        expect(isObservableValueReady(null)).toBe(false);
    });

    test('returns false for undefined values', () => {
        expect(isObservableValueReady(undefined)).toBe(false);
    });

    test('returns false for empty strings', () => {
        expect(isObservableValueReady('')).toBe(false);
    });

    test('returns true for non-empty strings', () => {
        expect(isObservableValueReady('hello')).toBe(true);
    });

    test('returns true for non-empty objects', () => {
        expect(isObservableValueReady({ name: 'John' })).toBe(true);
    });

    test('returns true for non-empty arrays', () => {
        expect(isObservableValueReady([1, 2, 3])).toBe(true);
    });

    test('returns true for non-empty numbers', () => {
        expect(isObservableValueReady(42)).toBe(true);
    });

    test('returns true for non-empty booleans', () => {
        expect(isObservableValueReady(true)).toBe(true);
    });

    test('returns true for non-empty functions', () => {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const myFunc = () => {};
        expect(isObservableValueReady(myFunc)).toBe(true);
    });
});
