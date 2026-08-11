import { deepEqual } from '@legendapp/state/sync';

describe('deepEqual', () => {
    test('compares arrays and dates structurally', () => {
        expect(deepEqual([new Date(1), { values: [1, 2] }], [new Date(1), { values: [1, 2] }])).toBe(true);
        expect(deepEqual([new Date(1)], [new Date(2)])).toBe(false);
        expect(deepEqual([1, 2], [2, 1])).toBe(false);
    });

    test('compares Map values using native key identity', () => {
        const key = {};

        expect(deepEqual(new Map([['key', { value: 1 }]]), new Map([['key', { value: 1 }]]))).toBe(true);
        expect(deepEqual(new Map([['key', 1]]), new Map([['key', 2]]))).toBe(false);
        expect(deepEqual(new Map([[key, 1]]), new Map([[key, 1]]))).toBe(true);
        expect(deepEqual(new Map([[{}, 1]]), new Map([[{}, 1]]))).toBe(false);
    });

    test('compares Set values using native identity', () => {
        const value = {};

        expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
        expect(deepEqual(new Set([1]), new Set([2]))).toBe(false);
        expect(deepEqual(new Set([value]), new Set([value]))).toBe(true);
        expect(deepEqual(new Set([{}]), new Set([{}]))).toBe(false);
    });

    test('treats distinct weak collections as unequal', () => {
        const weakMap = new WeakMap();
        const weakSet = new WeakSet();

        expect(deepEqual(weakMap, weakMap)).toBe(true);
        expect(deepEqual(weakMap, new WeakMap())).toBe(false);
        expect(deepEqual(weakSet, weakSet)).toBe(true);
        expect(deepEqual(weakSet, new WeakSet())).toBe(false);
    });
});
