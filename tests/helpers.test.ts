import fc from 'fast-check';
import { isDeepStrictEqual } from 'node:util';
import { deepEqual, diffObjects } from '../src/sync/syncHelpers';
import { getValueAtPath } from '../src/helpers';
import { observe, symbolDelete } from '@legendapp/state';
import { isObservable } from '../src/globals';
import { deepMerge, isObservableValueReady, mergeIntoObservable } from '../src/helpers';
import { observable } from '../src/observable';

describe('mergeIntoObservable', () => {
    test('merge onto empty object', () => {
        const target = observable({});
        const source = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target, source);
        expect(merged.peek()).toEqual({ a: { b: { c: { d: 5 } } } });
    });
    test('merge undefined should do nothing', () => {
        const target = observable({ a: { b: { c: { d: 5 } } } });
        const merged = mergeIntoObservable(target, undefined);
        expect(merged.peek()).toEqual(target.peek());
    });
    test('merge null should delete', () => {
        const target = observable({ a: { b: { c: { d: 5 } } } });
        const merged = mergeIntoObservable(target, null);
        expect(merged.peek()).toEqual(null);
    });
    test('merge null should delete (2)', () => {
        const target = observable({ a: { b: { c: { d: 5 } } } });
        const source = { a: { b: { c: { d: null } } } };
        const merged = mergeIntoObservable(target, source);
        expect(merged.peek()).toEqual(source);
    });
    test('merge onto empty observable', () => {
        const target = observable();
        const source = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: { b: { c: { d: 5 } } } });
        expect(isObservable(merged)).toBe(true);
    });
    test('merge onto empty observable activated object', () => {
        const target = observable({ child: () => ({}) });
        target.child.get();
        const source = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target.child, source);
        expect(merged.get()).toEqual({ a: { b: { c: { d: 5 } } } });
        expect(isObservable(merged)).toBe(true);
    });
    test('should merge two plain objects', () => {
        const target = observable({ a: 1, b: 2 });
        const source = { b: 3, c: 4 };
        const merged = mergeIntoObservable(target, source);
        expect(merged.peek()).toEqual({ a: 1, b: 3, c: 4 });
    });
    test('should merge two observable objects', () => {
        const target = observable({ a: 1, b: 2 });
        const source = observable({ b: 3, c: 4 });
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4 });
    });
    test('should merge a plain object and an observable object', () => {
        const target = observable({ a: 1, b: 2 });
        const source = { b: 3, c: 4 };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4 });
    });
    test('should delete a key marked with symbolDelete', () => {
        const target = observable({ a: 1, b: 2 });
        const source = { b: symbolDelete };
        const merged = mergeIntoObservable(target, source);
        expect(merged.peek()).toEqual({ a: 1 });
    });
    test('observing a mergeIntoObservable should run once', () => {
        const target = observable({ a: 1, b: 2, c: [] });
        const source = { c: ['a', 'b'] };
        let num = 0;
        observe(() => {
            num++;
            target.get();
        });
        mergeIntoObservable(target, source);
        expect(num).toEqual(2);
    });
    test('should not merge undefined with sparse array', () => {
        const target = observable({
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
        });
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
        expect(target.peek()).toEqual({
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
    test('merge indexed object into array', () => {
        const target = observable([{ key: '0' }]);
        const source = { 1: { key: '1' } };
        const merged = mergeIntoObservable(target, source);
        expect(merged.peek()).toEqual([{ key: '0' }, { key: '1' }]);
    });
    test('Can merge if parent null', () => {
        interface Data {
            test?: {
                test2?: {
                    test3?: string;
                };
            };
        }
        const obs = observable<Data>({ test: () => null });
        obs.test.get();
        obs.test.set(null as any);

        mergeIntoObservable(obs.test, { test2: { test3: 'hi' } });
        expect(obs.test.test2.test3.get()).toEqual('hi');
    });
    test('merge multiple should not override intermediate', () => {
        const target = observable({ syncMode: 'get' });
        const source1 = {
            persist: {
                indexedDB: {
                    databaseName: 'LegendTest',
                    version: 20,
                    tableNames: [
                        'documents',
                        'items',
                        'settings',
                        'boards',
                        'localStorage',
                        'contacts',
                        'plugins',
                        'Drive',
                        'GCalendar',
                        'Gmail',
                        'pluginsNew',
                        'GmailMessages',
                        'Boards',
                    ],
                },
            },
            debounceSet: 1000,
            retry: {
                infinite: true,
            },
        };
        const source2 = {
            persist: {
                name: 'documents',
                indexedDB: {
                    prefixID: 'u',
                },
                transform: {},
            },
            synced: true,
        };
        const source1Str = JSON.stringify(source1);
        const source2Str = JSON.stringify(source2);
        const merged = mergeIntoObservable(target, source1, source2);
        expect(JSON.stringify(source1) === source1Str);
        expect(JSON.stringify(source2) === source2Str);
        expect(merged.peek()).toEqual({
            debounceSet: 1000,
            persist: {
                indexedDB: {
                    databaseName: 'LegendTest',
                    prefixID: 'u',
                    tableNames: [
                        'documents',
                        'items',
                        'settings',
                        'boards',
                        'localStorage',
                        'contacts',
                        'plugins',
                        'Drive',
                        'GCalendar',
                        'Gmail',
                        'pluginsNew',
                        'GmailMessages',
                        'Boards',
                    ],
                    version: 20,
                },
                name: 'documents',
                transform: {},
            },
            retry: {
                infinite: true,
            },
            syncMode: 'get',
            synced: true,
        });

        const merged2 = mergeIntoObservable(observable({ syncMode: 'get' }), source1, source2);
        expect(JSON.stringify(source1) === source1Str);
        expect(JSON.stringify(source2) === source2Str);
        expect(merged2.peek()).toEqual({
            debounceSet: 1000,
            persist: {
                indexedDB: {
                    databaseName: 'LegendTest',
                    prefixID: 'u',
                    tableNames: [
                        'documents',
                        'items',
                        'settings',
                        'boards',
                        'localStorage',
                        'contacts',
                        'plugins',
                        'Drive',
                        'GCalendar',
                        'Gmail',
                        'pluginsNew',
                        'GmailMessages',
                        'Boards',
                    ],
                    version: 20,
                },
                name: 'documents',
                transform: {},
            },
            retry: {
                infinite: true,
            },
            syncMode: 'get',
            synced: true,
        });
    });
    test('should merge Maps', () => {
        const target = observable({ a: 1, b: 2, map: new Map([['a', { arr: [0, 1] }]]) });
        const source = { b: 3, c: 4, map: new Map([['a', { arr: [2, 3] }]]) };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4, map: new Map([['a', { arr: [2, 3] }]]) });
        expect(isObservable(merged)).toBe(true);
    });
    test('should merge Maps (2)', () => {
        const target = observable({ a: 1, b: 2, map: new Map([['a', { obj: { 0: 0, 1: 1 } }]]) });
        const source = { b: 3, c: 4, map: new Map([['a', { obj: { 2: 2, 3: 3 } }]]) };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({
            a: 1,
            b: 3,
            c: 4,
            map: new Map([['a', { obj: { 0: 0, 1: 1, 2: 2, 3: 3 } }]]),
        });
        expect(isObservable(merged)).toBe(true);
    });
    test('should merge Maps (3)', () => {
        const target = observable({ a: 1, b: 2, map: new Map([['a', { arr: [0, 1] }]]) });
        const source = { b: 3, c: 4, map: new Map([['a', { arr: [] }]]) };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4, map: new Map([['a', { arr: [] }]]) });
        expect(isObservable(merged)).toBe(true);
    });
    test('should merge Maps (4)', () => {
        const target = observable({ a: 1, b: 2, map: new Map([['a', { arr: [0, 1] }]]) });
        const source = {
            b: 3,
            c: 4,
            map: new Map([
                ['a', {}],
                ['b', { arr: [] }],
            ]),
        };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({
            a: 1,
            b: 3,
            c: 4,
            map: new Map([
                ['a', {}],
                ['b', { arr: [] }],
            ]),
        });
        expect(isObservable(merged)).toBe(true);
    });
    test('should merge Sets', () => {
        const target = observable({ a: 1, b: 2, map: new Set([0, 1]) });
        const source = { b: 3, c: 4, map: new Set([2, 3]) };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({ a: 1, b: 3, c: 4, map: new Set([0, 1, 2, 3]) });
        expect(isObservable(merged)).toBe(true);
    });
    test('should delete symbolDelete', () => {
        const target = observable({});
        const source = { asdf: symbolDelete };
        const merged = mergeIntoObservable(target, source);
        expect(merged.get()).toEqual({});
    });
    // Tests for https://github.com/LegendApp/legend-state/issues/468
    // Array elements should be removed when source array is shorter than target
    test('should remove array elements when source is shorter', () => {
        const target = observable({ arr: ['a', 'b', 'c'] });
        const source = { arr: ['a'] };
        const merged = mergeIntoObservable(target, source);
        expect(merged.arr.get()).toEqual(['a']);
    });
    test('should remove array elements when merging nested object', () => {
        const target = observable({ data: { items: [1, 2, 3, 4, 5] } });
        const source = { data: { items: [1, 2] } };
        const merged = mergeIntoObservable(target, source);
        expect(merged.data.items.get()).toEqual([1, 2]);
    });
    test('should handle array with single element removal', () => {
        const target = observable({ tags: ['tag1', 'tag2'] });
        const source = { tags: ['tag1'] };
        const merged = mergeIntoObservable(target, source);
        expect(merged.tags.get()).toEqual(['tag1']);
    });
    test('should handle complete array replacement with different values', () => {
        const target = observable({ ids: ['a', 'b', 'c'] });
        const source = { ids: ['x', 'y'] };
        const merged = mergeIntoObservable(target, source);
        expect(merged.ids.get()).toEqual(['x', 'y']);
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
describe('deepMerge', () => {
    test('should return the last source if the target is a primitive', () => {
        expect(deepMerge(0, { a: 1 })).toEqual({ a: 1 });
    });

    test('should merge objects with nested properties', () => {
        const target = { a: { b: 1 } };
        const source = { a: { c: 2 }, d: 3 };
        const expected = { a: { b: 1, c: 2 }, d: 3 };
        expect(deepMerge(target, source)).toEqual(expected);
    });

    test('should not merge arrays', () => {
        const target = [1, 2];
        const source = [3, 4];
        const expected = [3, 4];
        expect(deepMerge(target, source)).toEqual(expected);
    });

    // Test 1: Merging two simple objects
    test('merges two simple objects', () => {
        const obj1 = { a: 1, b: 2 };
        const obj2 = { b: 3, c: 4 };
        expect(deepMerge(obj1, obj2)).toEqual({ a: 1, b: 3, c: 4 });
    });

    // Test 2: Merging objects with nested objects
    test('merges objects with nested objects', () => {
        const obj1 = { a: { x: 1 }, b: 2 };
        const obj2 = { a: { y: 2 }, c: 3 };
        expect(deepMerge(obj1, obj2)).toEqual({ a: { x: 1, y: 2 }, b: 2, c: 3 });
    });

    // Test 4: Merging objects with arrays
    test('merges objects with arrays', () => {
        const obj1 = { a: [1, 2], b: 2 };
        const obj2 = { a: [3, 4], c: 3 };
        expect(deepMerge(obj1, obj2)).toEqual({ a: [3, 4], b: 2, c: 3 });
    });

    // Test 5: Merging primitives
    test('returns the last primitive when merging primitives', () => {
        expect(deepMerge(1, 2, 3)).toBe(3);
        expect(deepMerge('a', 'b', 'c')).toBe('c');
        expect(deepMerge(true, false)).toBe(false);
    });

    // Test 6: Merging objects with null values
    test('handles null values', () => {
        const obj1 = { a: 1, b: null };
        const obj2 = { b: 2, c: null };
        expect(deepMerge(obj1, obj2)).toEqual({ a: 1, b: 2, c: null });
    });

    // Test 7: Merging objects with undefined values
    test('handles undefined values', () => {
        const obj1 = { a: 1, b: undefined };
        const obj2 = { b: 2, c: undefined };
        expect(deepMerge(obj1, obj2)).toEqual({ a: 1, b: 2, c: undefined });
    });

    // Test 8: Merging multiple objects
    test('merges multiple objects', () => {
        const obj1 = { a: 1 };
        const obj2 = { b: 2 };
        const obj3 = { c: 3 };
        expect(deepMerge(obj1, obj2, obj3)).toEqual({ a: 1, b: 2, c: 3 });
    });

    // Test 9: Merging objects with functions
    test('merges objects with functions', () => {
        const obj1: Record<string, any> = { a: () => 1 };
        const obj2 = { b: () => 2 };
        const result = deepMerge(obj1, obj2);
        expect(typeof result.a).toBe('function');
        expect(typeof result.b).toBe('function');
        expect(result.a()).toBe(1);
        expect(result.b()).toBe(2);
    });

    // Test 11: Merging objects with date objects
    test('merges objects with date objects', () => {
        const date1 = new Date('2023-01-01');
        const date2 = new Date('2023-12-31');
        const obj1 = { date: date1 };
        const obj2 = { date: date2 };
        expect(deepMerge(obj1, obj2)).toEqual({ date: date2 });
    });

    // Test 12: Merging objects with regular expressions
    test('merges objects with regular expressions', () => {
        const obj1 = { regex: /test1/ };
        const obj2 = { regex: /test2/ };
        expect(deepMerge(obj1, obj2)).toEqual({ regex: /test2/ });
    });

    // Test 13: Merging deeply nested objects
    test('merges deeply nested objects', () => {
        const obj1 = { a: { b: { c: 1 } } };
        const obj2 = { a: { b: { d: 2 } } };
        expect(deepMerge(obj1, obj2)).toEqual({ a: { b: { c: 1, d: 2 } } });
    });

    // Test 15: Merging arrays with objects
    test('merges arrays with objects', () => {
        const arr = [1, 2, 3];
        const obj = { 1: 'two', 3: 'four' };
        expect(deepMerge(arr, obj)).toEqual([1, 'two', 3, 'four']);
    });

    // Test 16: Merging objects with different types for the same key
    test('handles different types for the same key', () => {
        const obj1 = { a: { b: 1 } };
        const obj2 = { a: [1, 2, 3] };
        expect(deepMerge(obj1, obj2)).toEqual({ a: { 0: 1, 1: 2, 2: 3, b: 1 } });
    });

    // Test 17: Merging empty objects and arrays
    test('handles empty objects and arrays', () => {
        const obj1 = {};
        const obj2: any[] = [];
        expect(deepMerge(obj1, obj2)).toEqual({});
    });

    // Test 18: Merging objects with prototype properties
    test('ignores prototype properties', () => {
        const obj1 = Object.create({ a: 1 });
        const obj2 = { b: 2 };
        expect(deepMerge(obj1, obj2)).toEqual({ b: 2 });
    });

    // Test 19: Merging typed objects (preserving type)
    test('preserves types of merged objects', () => {
        interface TestObject {
            a: number;
            b?: string;
        }
        const obj1: TestObject = { a: 1 };
        const obj2 = { b: 'test' };
        const result: TestObject = deepMerge(obj1, obj2);
        expect(result).toEqual({ a: 1, b: 'test' });
    });

    // Test 20: Merging objects with undefined target
    test('handles undefined target', () => {
        const obj = { a: 1 };
        expect(deepMerge(undefined, obj)).toEqual({ a: 1 });
    });

    // Test 21: Merging objects with arrays of objects
    test('merges objects with arrays of objects', () => {
        const obj1 = { arr: [{ a: 1 }, { b: 2 }] };
        const obj2 = { arr: [{ c: 3 }] };
        expect(deepMerge(obj1, obj2)).toEqual({ arr: [{ a: 1, c: 3 }, { b: 2 }] });
    });

    // Test 23: Merging objects with arrays of different lengths
    test('merges objects with arrays of different lengths', () => {
        const obj1 = { arr: [1, 2, 3] };
        const obj2 = { arr: [4, 5] };
        expect(deepMerge(obj1, obj2)).toEqual({ arr: [4, 5, 3] });
    });

    // Test 24: Merging objects with special object types (e.g., Map, Set)
    test('handles special object types', () => {
        const map1 = new Map([
            ['a', 1],
            ['b', 2],
        ]);
        const set1 = new Set([1, 2, 3]);
        const obj1 = { map: map1, set: set1 };
        const obj2 = { map: new Map([['c', 3]]), set: new Set([4, 5]) };
        const result = deepMerge(obj1, obj2);
        expect(result.map).toBeInstanceOf(Map);
        expect(result.set).toBeInstanceOf(Set);
        expect(Array.from(result.map.entries())).toEqual([['c', 3]]);
        expect(Array.from(result.set)).toEqual([4, 5]);
    });

    // Test 27: Merging objects with properties that have different types
    test('handles properties with different types', () => {
        const obj1 = { prop: { nested: 'string' } };
        const obj2 = { prop: 42 };
        expect(deepMerge(obj1, obj2)).toEqual({ prop: 42 });
    });

    // Test 28: Merging very deeply nested objects
    test('handles very deeply nested objects', () => {
        const obj1 = { a: { b: { c: { d: { e: 1 } } } } };
        const obj2 = { a: { b: { c: { d: { f: 2 } } } } };
        expect(deepMerge(obj1, obj2)).toEqual({ a: { b: { c: { d: { e: 1, f: 2 } } } } });
    });
});

describe('sync deepEqual', () => {
    class Value {
        constructor(public value: number) {}
    }
    const shared = new Value(1);
    const symbol = Symbol('key');
    const cases: [string, any, any, boolean][] = [
        ['number', 1, 1, true],
        ['different numbers', 1, 2, false],
        ['NaN', NaN, NaN, true],
        ['signed zero', +0, -0, true],
        ['infinity', Infinity, Infinity, true],
        ['string', 'a', 'a', true],
        ['string vs number', '1', 1, false],
        ['boolean', true, false, false],
        ['bigint', BigInt(1), BigInt(1), true],
        ['different bigint', BigInt(1), BigInt(2), false],
        ['symbol identity', symbol, symbol, true],
        ['distinct symbols', Symbol('key'), Symbol('key'), false],
        ['null', null, null, true],
        ['undefined', undefined, undefined, true],
        ['null vs undefined', null, undefined, false],
        ['null vs object', null, {}, false],
        ['Date', new Date(123), new Date(123), true],
        ['changed Date', new Date(123), new Date(124), false],
        ['invalid Date', new Date(NaN), new Date(NaN), true],
        ['Date in array', [new Date(123)], [new Date(123)], true],
        ['RegExp', /a/gi, /a/gi, true],
        ['changed RegExp', /a/g, /b/g, false],
        ['RegExp flags', /a/g, /a/i, false],
        ['RegExp lastIndex', Object.assign(/a/g, { lastIndex: 1 }), /a/g, false],
        ['empty Map', new Map(), new Map(), true],
        ['Map value', new Map([['a', 1]]), new Map([['a', 2]]), false],
        ['Map keys', new Map([['a', 1]]), new Map([['b', 1]]), false],
        ['Map size', new Map([['a', 1]]), new Map(), false],
        [
            'Map ordering',
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            new Map([
                ['b', 2],
                ['a', 1],
            ]),
            true,
        ],
        ['nested Map', new Map([['a', { b: [1] }]]), new Map([['a', { b: [1] }]]), true],
        ['changed nested Map', new Map([['a', { b: [1] }]]), new Map([['a', { b: [2] }]]), false],
        ['structural Map keys', new Map([[{ a: 1 }, 2]]), new Map([[{ a: 1 }, 2]]), true],
        ['Map vs Set', new Map(), new Set(), false],
        ['empty Set', new Set(), new Set(), true],
        ['Set content', new Set([1]), new Set([2]), false],
        ['Set size', new Set([1]), new Set(), false],
        ['Set ordering', new Set([1, 2]), new Set([2, 1]), true],
        ['nested Set', new Set([{ a: [1] }]), new Set([{ a: [1] }]), true],
        ['changed nested Set', new Set([{ a: [1] }]), new Set([{ a: [2] }]), false],
        ['Set in Map', new Map([['a', new Set([1, 2])]]), new Map([['a', new Set([2, 1])]]), true],
        ['typed array', new Uint8Array([1, 2]), new Uint8Array([1, 2]), true],
        ['changed typed array', new Uint8Array([1, 2]), new Uint8Array([1, 3]), false],
        ['typed array type', new Uint8Array([1]), new Int8Array([1]), false],
        ['typed array length', new Uint8Array([1]), new Uint8Array([1, 2]), false],
        [
            'DataView offset',
            new DataView(new Uint8Array([0, 1]).buffer, 1),
            new DataView(new Uint8Array([1]).buffer),
            true,
        ],
        ['class identity', shared, shared, true],
        ['class instances', new Value(1), new Value(1), false],
        ['class vs object', new Value(1), { value: 1 }, false],
        ['boxed numbers', new Number(1), new Number(1), false],
        ['Promise', Promise.resolve(1), Promise.resolve(1), false],
        ['WeakMap', new WeakMap(), new WeakMap(), false],
        ['ArrayBuffer', new ArrayBuffer(1), new ArrayBuffer(1), false],
        ['object key order', { a: 1, b: 2 }, { b: 2, a: 1 }, true],
        ['missing key', { a: undefined }, {}, false],
        ['extra key', { a: 1 }, { a: 1, b: 2 }, false],
        ['different key', { a: undefined }, { b: undefined }, false],
        ['symbol key', { [symbol]: 1 }, { [symbol]: 2 }, false],
        ['array vs object', [], {}, false],
        ['array vs arraylike', [1], { 0: 1, length: 1 }, false],
        ['array length', [1], [1, 2], false],
        ['array ordering', [1, 2], [2, 1], false],
        ['nested arrays', [[{ a: 1 }]], [[{ a: 1 }]], true],
        ['sparse arrays', Array(2), Array(2), true],
        ['sparse vs undefined', Array(1), [undefined], false],
        [
            'array string metadata follows origin semantics',
            Object.assign([1], { extra: 2 }),
            Object.assign([1], { extra: 3 }),
            true,
        ],
        [
            'null prototype',
            Object.assign(Object.create(null), { a: 1 }),
            Object.assign(Object.create(null), { a: 1 }),
            true,
        ],
        ['different prototypes', Object.create(null), {}, false],
        [
            'throwing getter',
            {
                get a() {
                    throw Error('getter');
                },
            },
            { a: 1 },
            false,
        ],
        [
            'throwing proxy',
            new Proxy(
                {},
                {
                    getPrototypeOf() {
                        throw Error('proxy');
                    },
                },
            ),
            {},
            false,
        ],
    ];
    test.each(cases)('%s', (_name, a, b, equal) => {
        expect(deepEqual<any>(a, b)).toBe(equal);
        expect(deepEqual<any>(b, a)).toBe(equal);
    });

    test('cycles terminate conservatively and retain the identity fast path', () => {
        const a: any = { value: 1 };
        const b: any = { value: 1 };
        a.self = a;
        b.self = b;
        expect(deepEqual<any>(a, a)).toBe(true);
        expect(deepEqual<any>(a, b)).toBe(false);
        b.value = 2;
        expect(deepEqual<any>(a, b)).toBe(false);
        const x: any[] = [];
        const y: any[] = [];
        x.push(x);
        y.push(y);
        expect(deepEqual<any>(x, y)).toBe(false);
        y.push(1);
        expect(deepEqual<any>(x, y)).toBe(false);
        const m = new Map();
        const n = new Map();
        m.set('self', m);
        n.set('self', n);
        expect(deepEqual<any>(m, n)).toBe(false);
        const u = new Set();
        const v = new Set();
        u.add(u);
        v.add(v);
        expect(deepEqual<any>(u, v)).toBe(false);
    });
    test('excessive depth returns a conservative difference without throwing', () => {
        let a: any = 1;
        let b: any = 1;
        for (let i = 0; i < 10000; i++) {
            a = [a];
            b = [b];
        }
        expect(deepEqual<any>(a, b)).toBe(false);
    });
    test('ignore and null options recurse and conservatively bound cycles', () => {
        const a: any = { a: [{ x: 1, ignored: 1, nullable: null }] };
        const b: any = { a: [{ x: 1, ignored: 2 }] };
        expect(deepEqual<any>(a, b, ['ignored'], true)).toBe(true);
        expect(deepEqual<any>(a, b, ['ignored'])).toBe(false);
        expect(deepEqual<any>(a, b, undefined, true)).toBe(false);
        expect(deepEqual<any>(null, undefined, undefined, true)).toBe(false);
        a.self = a;
        b.self = b;
        expect(deepEqual<any>(a, b, ['ignored'], true)).toBe(false);
    });
    test('diffObjects keeps Map and Set changes in partial updates', () => {
        const before = { map: new Map([['a', 1]]), set: new Set([1]), same: [1] };
        const after = { map: new Map([['a', 2]]), set: new Set([2]), same: [1] };
        expect(diffObjects(before, after, true)).toEqual({ map: after.map, set: after.set });
    });
    test('seeded supported values match the independent Node comparator', () => {
        const json = fc.jsonValue({ maxDepth: 4 });
        const value = fc.oneof(
            json,
            fc.array(fc.tuple(fc.string(), json), { maxLength: 8 }).map((entries) => new Map(entries)),
            fc.array(json, { maxLength: 8 }).map((entries) => new Set(entries)),
            fc.uint8Array({ maxLength: 32 }),
            fc.integer({ min: 0, max: 100000 }).map((time) => new Date(time)),
        );
        fc.assert(
            fc.property(value, value, (a, b) => {
                expect(deepEqual<any>(a, b)).toBe(isDeepStrictEqual(a, b));
                const copy = structuredClone(a);
                expect(deepEqual<any>(a, copy)).toBe(isDeepStrictEqual(a, copy));
            }),
            { seed: 606410, numRuns: 500 },
        );
    });
    test('seeded reordered collections and mutated nested payloads match Node', () => {
        fc.assert(
            fc.property(fc.uniqueArray(fc.integer(), { maxLength: 20 }), fc.jsonValue(), (keys, payload) => {
                const a = new Map(keys.map((key) => [key, { payload }]));
                const b = new Map([...keys].reverse().map((key) => [key, { payload: structuredClone(payload) }]));
                expect(deepEqual<any>(a, b)).toBe(isDeepStrictEqual(a, b));
                const c = new Set([...keys].reverse().map((key) => ({ key, payload })));
                const d = structuredClone(c);
                expect(deepEqual<any>(c, d)).toBe(isDeepStrictEqual(c, d));
                b.set(0.5, { payload });
                expect(deepEqual<any>(a, b)).toBe(isDeepStrictEqual(a, b));
            }),
            { seed: 606411, numRuns: 150 },
        );
    });
    test('own properties cannot mask native contents', () => {
        const mask = <T extends object>(value: T, fields: Record<string, any>) =>
            Object.defineProperties(
                value,
                Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value }])),
            );
        const same = (fields: Record<string, any>, a: object, b: object) => {
            expect(deepEqual<any>(mask(a, fields), mask(b, fields))).toBe(false);
        };
        same({ getTime: () => 0 }, new Date(1), new Date(2));
        same({ source: 'x', flags: '' }, /a/, /b/);
        same({ global: false, flags: '' }, /a/g, /a/);
        const sameMap = { size: 1, keys: () => [1][Symbol.iterator](), get: () => 0 };
        same(sameMap, new Map([[1, 1]]), new Map([[1, 2]]));
        same({ size: 1, values: () => [1][Symbol.iterator]() }, new Set([1]), new Set([2]));
        const bytes = new Uint8Array([1]);
        same({ buffer: bytes.buffer, byteOffset: 0, byteLength: 1 }, new Uint8Array([1]), new Uint8Array([2]));
        same(
            { buffer: bytes.buffer, byteOffset: 0, byteLength: 1 },
            new DataView(new ArrayBuffer(1)),
            new DataView(bytes.buffer),
        );
        expect(
            diffObjects({ at: mask(/a/g, { global: false }) }, { at: mask(/a/, { global: false }) }, true),
        ).toHaveProperty('at');
        expect(
            diffObjects(
                { at: mask(new Date(1), { getTime: () => 0 }) },
                { at: mask(new Date(2), { getTime: () => 0 }) },
                true,
            ),
        ).toHaveProperty('at');
    });
});

describe('getValueAtPath Map steps', () => {
    test('traverses mixed objects, arrays and Maps including keys that shadow methods', () => {
        const value = { rows: new Map([['get', [{ child: new Map([['value', 42]]) }]]]) };
        expect(getValueAtPath(value, ['rows', 'get', '0', 'child', 'value'])).toBe(42);
        expect(getValueAtPath(value, ['rows', 'missing', 'child'])).toBeUndefined();
        expect(getValueAtPath(value, [])).toBe(value);
    });
});

test('Map depth exhaustion aborts structural alternatives even when a later value has identity', () => {
    const key = { id: 1 };
    const other = { id: 1 };
    let a: any = 1;
    let b: any = 1;
    for (let i = 0; i < 110; i++) {
        a = { value: a };
        b = { value: b };
    }
    const left = new Map([
        [key, a],
        [other, b],
    ]);
    const right = new Map([
        [key, b],
        [other, a],
    ]);
    expect(deepEqual<any>(left, right)).toBe(false);
    expect(deepEqual<any>(right, left)).toBe(false);
});

test('Map matching considers values when structural keys collide', () => {
    const key = { id: 1 };
    const a = new Map([
        [key, 1],
        [{ id: 1 }, 2],
    ]);
    const b = new Map([
        [key, 2],
        [{ id: 1 }, 1],
    ]);
    expect(deepEqual<any>(a, b)).toBe(true);
});

test('built-in content comparison also preserves extra enumerable state', () => {
    for (const make of [() => new Date(1), () => /a/g, () => new Uint8Array([1])]) {
        expect(deepEqual<any>(Object.assign(make(), { extra: 1 }), Object.assign(make(), { extra: 2 }))).toBe(false);
    }
    class CustomDate extends Date {
        hidden = 1;
    }
    expect(deepEqual<any>(new CustomDate(1), new CustomDate(1))).toBe(false);
    class CustomBytes extends Uint8Array {}
    expect(deepEqual<any>(new CustomBytes([1]), new CustomBytes([1]))).toBe(false);
});

test('distinct cycle topologies are symmetric conservative differences', () => {
    const a: any = {};
    const b: any = {};
    const c: any = {};
    a.next = b;
    b.next = a;
    c.next = c;
    expect(deepEqual<any>(a, c)).toBe(false);
    expect(deepEqual<any>(c, a)).toBe(false);
    const x: any[] = [];
    const y: any[] = [];
    const z: any[] = [];
    x.push(y);
    y.push(x);
    z.push(z);
    expect(deepEqual<any>(x, z)).toBe(false);
    expect(deepEqual<any>(z, x)).toBe(false);
    const m: Map<any, any> = new Map();
    const n: Map<any, any> = new Map();
    m.set({ key: 1 }, m);
    m.set({ key: 1 }, m);
    n.set({ key: 1 }, n);
    n.set({ key: 1 }, n);
    expect(deepEqual<any>(m, n)).toBe(false);
    expect(deepEqual<any>(n, m)).toBe(false);
});

test.each(['string', 'symbol'] as const)('deepEqual requires enumerable membership for mismatched %s keys', (kind) => {
    const key = kind === 'symbol' ? Symbol('key') : 'key';
    const other = kind === 'symbol' ? Symbol('other') : 'other';
    const a = { [key]: 1 };
    const b = Object.defineProperty({ [other]: 2 }, key, { value: 1 });
    expect(deepEqual(a, b)).toBe(false);
    expect(deepEqual(b, a)).toBe(false);
});

test('array string metadata is ignored consistently with comparison options', () => {
    const a = Object.assign([1], { extra: 2, '01': 'left' });
    const b = Object.assign([1], { extra: 3, '01': 'right' });
    for (const ignored of [undefined, [], ['extra'], ['0']]) {
        expect(deepEqual(a, b, ignored)).toBe(true);
        expect(deepEqual(b, a, ignored, true)).toBe(true);
    }
});

test('array options preserve origin index semantics and recurse into object fields', () => {
    expect(deepEqual<any>([null], [undefined], undefined, true)).toBe(false);
    expect(deepEqual(Array(1), [null], undefined, true)).toBe(false);
    expect(deepEqual([undefined], Array(1), undefined, true)).toBe(false);
    expect(deepEqual<any>([null], [1], undefined, true)).toBe(false);
    expect(deepEqual([1, { name: 'left' }], [2, { name: 'right' }], ['0', 'name'])).toBe(false);
    expect(deepEqual([{ name: 'left' }], [{ name: 'right' }], ['name'])).toBe(true);
    expect(deepEqual<any>([{ nullable: null }], [{}], undefined, true)).toBe(true);
    expect(deepEqual([1], [2], ['0'])).toBe(false);
    expect(deepEqual([1], [2], ['00'])).toBe(false);
    expect(deepEqual([1, 2], [1, 3], ['1e0'])).toBe(false);
    expect(deepEqual([1], [2], ['-0'])).toBe(false);
    expect(deepEqual(Array(1), [1], ['0'])).toBe(false);
    expect(deepEqual([1], [1, 2], ['0', '1'])).toBe(false);
});

test('non-enumerable numeric array properties remain array contents', () => {
    const a = Object.defineProperty(Array(1), '0', { value: 1 });
    const b = Object.defineProperty(Array(1), '0', { value: 2 });
    expect(deepEqual(a, [1])).toBe(true);
    expect(deepEqual([1], a)).toBe(true);
    expect(deepEqual(a, b)).toBe(false);
    expect(deepEqual(b, a)).toBe(false);
    expect(deepEqual(a, Array(1))).toBe(false);
    expect(deepEqual(a, b, ['0'])).toBe(false);
});

test('array symbols retain symmetric enumerable membership with options', () => {
    const key = Symbol('key');
    const other = Symbol('other');
    const a = Object.assign([1], { [key]: 1 });
    const b = Object.defineProperty(Object.assign([1], { [other]: 2 }), key, { value: 1 });
    for (const ignored of [undefined, [], ['0']]) {
        expect(deepEqual<any>(a, b, ignored)).toBe(false);
        expect(deepEqual<any>(b, a, ignored)).toBe(false);
        expect(deepEqual<any>(a, Object.assign([1], { [key]: 1 }), ignored)).toBe(true);
    }
    expect(
        deepEqual<any>(Object.assign([], { [key]: null }), Object.assign([], { [key]: undefined }), undefined, true),
    ).toBe(true);
});

test.each(['array', 'object'] as const)('inherited %s prototype indices do not fill sparse array contents', (kind) => {
    const prototype = kind === 'array' ? Array.prototype : Object.prototype;
    const previous = Object.getOwnPropertyDescriptor(prototype, '2');
    const previousLength = Array.prototype.length;
    Object.defineProperty(prototype, '2', { value: 'inherited', configurable: true, writable: true });
    try {
        const sparse = Array(3);
        const own = Array(3);
        own[2] = 'inherited';
        expect(deepEqual(sparse, own)).toBe(false);
        expect(deepEqual(own, sparse)).toBe(false);
        expect(deepEqual(sparse, Array(3))).toBe(true);
        expect(deepEqual(sparse, own, ['2'])).toBe(false);
    } finally {
        if (previous) Object.defineProperty(prototype, '2', previous);
        else Reflect.deleteProperty(prototype, '2');
        if (kind === 'array') Array.prototype.length = previousLength;
    }
});

test.each(['array', 'object'] as const)('inherited %s getters are not array contents', (kind) => {
    const prototype = kind === 'array' ? Array.prototype : Object.prototype;
    const previous = Object.getOwnPropertyDescriptor(prototype, '2');
    const previousLength = Array.prototype.length;
    let reads = 0;
    let equal: boolean;
    let different: boolean;
    Object.defineProperty(prototype, '2', {
        configurable: true,
        get() {
            reads++;
            throw Error('inherited index must not be read');
        },
        set(value) {
            Object.defineProperty(this, '2', { value, configurable: true, enumerable: true, writable: true });
        },
    });
    try {
        equal = deepEqual(Array(3), Array(3));
        const own = Array(3);
        own[2] = 'own';
        different = deepEqual(Array(3), own);
    } finally {
        if (previous) Object.defineProperty(prototype, '2', previous);
        else Reflect.deleteProperty(prototype, '2');
        if (kind === 'array') Array.prototype.length = previousLength;
    }
    expect(equal).toBe(true);
    expect(different).toBe(false);
    expect(reads).toBe(0);
});

describe('deepMerge literal data ownership', () => {
    test('own constructor fields preserve earlier fields and function leaves stay data', () => {
        let calls = 0;
        const fn = Object.assign(() => calls++, { data: 1 });
        const target = { keep: 1, nested: { keep: 2 }, fn: 0 };
        const source = { constructor: { label: 'data' }, nested: { constructor: 0, next: 3 }, fn };
        const result: any = deepMerge(target, source);
        expect(result.keep).toBe(1);
        expect(result.constructor).toEqual({ label: 'data' });
        expect(result.nested).toEqual({ keep: 2, constructor: 0, next: 3 });
        expect(result.fn).toBe(fn);
        expect(calls).toBe(0);
        expect(target).toEqual({ keep: 1, nested: { keep: 2 }, fn: 0 });
    });
    test('own __proto__ fields remain data without replacing the output prototype', () => {
        const source = JSON.parse('{"__proto__":{"local":1},"nested":{"__proto__":{"nested":2}}}');
        const result: any = deepMerge({ keep: 1, nested: { keep: 2 } }, source);
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(result, '__proto__')!.value).toEqual({ local: 1 });
        expect(Object.getPrototypeOf(result.nested)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(result.nested, '__proto__')!.value).toEqual({ nested: 2 });
        expect(result.keep).toBe(1);
        expect(result.nested.keep).toBe(2);
        expect(source).toEqual(JSON.parse('{"__proto__":{"local":1},"nested":{"__proto__":{"nested":2}}}'));
    });
    test('inherited setters cannot consume source data', () => {
        const key = 'deepMergeInheritedSetter';
        const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);
        let calls = 0;
        let result: any;
        try {
            Object.defineProperty(Object.prototype, key, { configurable: true, set: () => calls++ });
            result = deepMerge({}, { [key]: { saved: 1 } });
        } finally {
            if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
            else delete (Object.prototype as any)[key];
        }
        expect(calls).toBe(0);
        expect(result[key]).toEqual({ saved: 1 });
        expect(Object.hasOwn(result, key)).toBe(true);
    });
    test('inherited values are not recursive merge bases', () => {
        const key = 'deepMergeInheritedBase';
        const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);
        const inherited = { foreign: 1 };
        let result: any;
        try {
            Object.defineProperty(Object.prototype, key, { configurable: true, writable: true, value: inherited });
            result = deepMerge({}, { [key]: { saved: 2 } });
        } finally {
            if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
            else delete (Object.prototype as any)[key];
        }
        expect(result[key]).toEqual({ saved: 2 });
        expect(inherited).toEqual({ foreign: 1 });
    });
    test('null-prototype records merge while non-record instances remain atomic', () => {
        const source = Object.assign(Object.create(null), { constructor: 'data', next: 2 });
        expect(deepMerge({ keep: 1 }, source)).toEqual({ keep: 1, constructor: 'data', next: 2 });
        class Atomic {
            field = 1;
        }
        for (const value of [new Atomic(), new Date(1), /data/, new Map([['x', 1]]), new Set([1])])
            expect(deepMerge({ keep: 1 }, value)).toBe(value);
    });
    test('ordinary record proxies retain the existing merge and inspection clocks', () => {
        let prototypes = 0;
        let constructors = 0;
        const source = new Proxy(
            { next: 2 },
            {
                getPrototypeOf: () => {
                    if (++prototypes > 2) throw Error('unexpected prototype inspection');
                    return Object.prototype;
                },
                get: (target, key, receiver) => {
                    if (key === 'constructor') constructors++;
                    return Reflect.get(target, key, receiver);
                },
            },
        );
        expect(deepMerge({ keep: 1 }, source)).toEqual({ keep: 1, next: 2 });
        expect(constructors).toBe(1);
    });
});

describe('literal response application', () => {
    test('a missing __proto__ updater receives undefined and creates own data', () => {
        const raw = { keep: 1 };
        const target = observable(raw);
        const previous: any[] = [];
        mergeIntoObservable(target, JSON.parse('{"get":1,"set":2,"peek":3,"constructor":4}'));
        mergeIntoObservable(target, {
            ['__proto__']: (value: any) => {
                previous.push(value);
                return { saved: 1 };
            },
        });
        expect(previous).toEqual([undefined]);
        expect(Object.getPrototypeOf(target.peek())).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(target.peek(), '__proto__')!.value).toEqual({ saved: 1 });
        expect(target.peek()).toEqual(
            JSON.parse('{"keep":1,"get":1,"set":2,"peek":3,"constructor":4,"__proto__":{"saved":1}}'),
        );
    });
    test('existing own __proto__ accessors retain their setter and descriptor', () => {
        let value = 0;
        let sets = 0;
        const raw: any = {};
        const get = () => value;
        const set = (next: number) => {
            value = next;
            sets++;
        };
        Object.defineProperty(raw, '__proto__', { configurable: true, enumerable: true, get, set });
        const target = observable(raw);
        mergeIntoObservable(target, { ['__proto__']: 2 });
        expect(value).toBe(2);
        expect(sets).toBe(1);
        expect(Object.getOwnPropertyDescriptor(raw, '__proto__')!.get).toBe(get);
        expect(Object.getOwnPropertyDescriptor(raw, '__proto__')!.set).toBe(set);
        expect(Object.getPrototypeOf(raw)).toBe(Object.prototype);
    });
    test('observable function children and linked values keep their normal merge behavior', () => {
        const linked = observable({ n: 0 });
        let calls = 0;
        const target = observable({
            linked,
            selected: () => {
                calls++;
                return { n: 0 };
            },
        });
        expect(target.selected.get()).toEqual({ n: 0 });
        expect(typeof target.selected).toBe('function');
        mergeIntoObservable(target, { linked: { n: 2 }, selected: { n: 3 } });
        expect(linked.peek()).toEqual({ n: 2 });
        expect(target.selected.peek()).toEqual({ n: 3 });
        expect(calls).toBe(1);
    });
});

describe('typed Map response application', () => {
    test('merge and deletion select numeric Map keys without modifying their string siblings', () => {
        const target = observable(
            new Map<any, any>([
                [1, { value: 0 }],
                ['1', { value: 10 }],
            ]),
        );
        mergeIntoObservable(target, new Map([[1, { saved: 2 }]]));
        expect(target.peek().get(1)).toEqual({ value: 0, saved: 2 });
        expect(target.peek().get('1')).toEqual({ value: 10 });
        mergeIntoObservable(target, new Map([[1, symbolDelete]]));
        expect(target.peek().has(1)).toBe(false);
        expect(target.peek().get('1')).toEqual({ value: 10 });
    });
    test('ordinary object source inspection still precedes target property access', () => {
        const trace: string[] = [];
        const child = { value: 0 };
        const target = observable({
            get row() {
                trace.push('target');
                return child;
            },
        });
        const row = {
            get [Symbol.toStringTag]() {
                trace.push('source');
                return undefined;
            },
            value: 1,
        };
        target.peek();
        trace.length = 0;
        mergeIntoObservable(target, { row });
        expect(trace[0]).toBe('source');
        expect(target.peek().row.value).toBe(1);
    });
});

describe('Map size data key namespace', () => {
    test('the size entry keeps its full row during a merge', () => {
        const target = observable(new Map([['size', { value: 0 }]]));
        expect(target.get('size').peek()).toEqual({ value: 0 });
        mergeIntoObservable(target, new Map([['size', { saved: 1 }]]));
        expect(target.peek().get('size')).toEqual({ value: 0, saved: 1 });
        expect(target.get('size').peek()).toEqual({ value: 0, saved: 1 });
        expect(target.size).toBe(1);
    });
    test('Map.size still observes additions and removals independently of a size entry', () => {
        const target = observable(new Map([['size', { value: 0 }]]));
        const sizes: number[] = [];
        const dispose = observe(() => {
            sizes.push(target.size);
        });
        try {
            target.set('other', { value: 1 });
            target.delete('other');
            expect(sizes).toEqual([1, 2, 1]);
            expect(target.size).toBe(1);
        } finally {
            dispose();
        }
    });
});

describe('diffObjects Date fallback', () => {
    const data = (time: number, fields: Record<string | symbol, any>) => {
        const value = new Date(time);
        for (const key of Reflect.ownKeys(fields))
            Object.defineProperty(value, key, { value: fields[key], enumerable: true, configurable: true });
        return value;
    };
    test.each(['string', 'symbol'] as const)('deep comparison retains changed %s Date metadata', (kind) => {
        const key = kind === 'symbol' ? Symbol('note') : 'note';
        const before = data(1, { [key]: 1 });
        const after = data(1, { [key]: 2 });
        const diff = diffObjects({ date: before }, { date: after }, true);
        expect(Object.keys(diff)).toEqual(['date']);
        expect(diff.date).toBe(after);
    });
    test('deep fallback reads native time without invoking a failing getTime metadata getter', () => {
        let calls = 0;
        const before = new Date(1);
        const after = new Date(1);
        Object.defineProperty(before, 'getTime', {
            enumerable: true,
            get() {
                calls++;
                throw Error('metadata');
            },
        });
        const diff = diffObjects({ date: before }, { date: after }, true);
        expect(diff.date).toBe(after);
        expect(calls).toBe(0);
    });
    test.each([1, 2])('shallow comparison ignores literal getTime data at native time %s', (time) => {
        const before = data(1, { getTime: 'before' });
        const after = data(time, { getTime: 'after' });
        const diff = diffObjects({ date: before }, { date: after });
        expect(Object.keys(diff)).toEqual(time === 1 ? [] : ['date']);
        if (time !== 1) expect(diff.date).toBe(after);
    });
    test('shallow getTime callbacks cannot hide a native timestamp change', () => {
        let calls = 0;
        const getTime = () => {
            calls++;
            return 0;
        };
        const after = data(2, { getTime });
        const diff = diffObjects({ date: data(1, { getTime }) }, { date: after });
        expect(diff.date).toBe(after);
        expect(calls).toBe(0);
    });
    test('shallow equal timestamps retain existing metadata deduplication', () => {
        expect(diffObjects({ date: data(1, { note: 1 }) }, { date: data(1, { note: 2 }) })).toEqual({});
    });
    test('deep equivalent invalid Dates retain comparator deduplication', () => {
        expect(diffObjects({ date: data(NaN, { note: 1 }) }, { date: data(NaN, { note: 1 }) }, true)).toEqual({});
    });
});
