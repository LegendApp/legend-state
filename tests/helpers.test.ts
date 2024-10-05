import { symbolDelete } from '@legendapp/state';
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
