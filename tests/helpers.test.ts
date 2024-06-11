import { symbolDelete } from '@legendapp/state';
import { isObservable } from '../src/globals';
import { isObservableValueReady, mergeIntoObservable } from '../src/helpers';
import { observable } from '../src/observable';

describe('mergeIntoObservable', () => {
    test('merge onto empty object', () => {
        const target = {};
        const source = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual({ a: { b: { c: { d: 5 } } } });
        expect(isObservable(merged)).toBe(false);
    });
    test('merge undefined should do nothing', () => {
        const target = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target, undefined);
        expect(merged).toEqual(target);
    });
    test('merge null should delete', () => {
        const target = { a: { b: { c: { d: 5 } } } };
        const merged = mergeIntoObservable(target, null);
        expect(merged).toEqual(null);
    });
    test('merge null should delete (2)', () => {
        const target = { a: { b: { c: { d: 5 } } } };
        const source = { a: { b: { c: { d: null } } } };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual(source);
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
    test('merge indexed object into array', () => {
        const target = [{ key: '0' }];
        const source = { 1: { key: '1' } };
        const merged = mergeIntoObservable(target, source);
        expect(merged).toEqual([{ key: '0' }, { key: '1' }]);
        expect(isObservable(merged)).toBe(false);
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
        const target = { syncMode: 'get' };
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
        expect(merged).toEqual({
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

        const merged2 = mergeIntoObservable({ syncMode: 'get' }, source1, source2);
        expect(JSON.stringify(source1) === source1Str);
        expect(JSON.stringify(source2) === source2Str);
        expect(merged2).toEqual({
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
