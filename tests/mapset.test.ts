import { observe } from '../src/observe';
import { isObservable, optimized } from '../src/globals';
import { mergeIntoObservable } from '../src/helpers';
import { observable } from '../src/observable';
import { expectChangeHandler } from './testglobals';

describe('Map default behavior', () => {
    test('Map get', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });

        // Map get
        expect(isObservable(obs.test)).toEqual(true);
        expect(isObservable(obs.test.get('key'))).toEqual(true);
        expect(obs.test.get('key').get()).toEqual('value');
        // Observable get
        expect(obs.test.get()).toBeInstanceOf(Map);
    });
    test('Map set', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });
        expect(obs.test.set('key2', 'value2')).toBeInstanceOf(Map);
        expect(obs.test.get('key2').get()).toEqual('value2');

        obs.test.set(new Map([['key3', 'value3']]));
        expect(obs.test.get('key3').get()).toEqual('value3');
        expect(obs.test.has('key1')).toEqual(false);
    });
    test('Map delete', () => {
        const obs = observable({
            test: new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        });
        expect(obs.test.delete('key2')).toEqual(true);
        expect(obs.test.has('key2')).toEqual(false);

        obs.test.delete();
        expect(obs.test.get()).toEqual(undefined);
    });
    test('Map clear', () => {
        const obs = observable({
            test: new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        });
        obs.test.clear();
        expect(obs.test.has('key2')).toEqual(false);
    });
    test('Map assign object', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });
        obs.test.assign({
            key2: 'value2',
        });
        expect(obs.test.get()).toEqual(
            new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        );
    });
    test('Map assign map', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });
        obs.test.assign(new Map([['key2', 'value2']]));
        expect(obs.test.get()).toEqual(
            new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        );
    });
    test('Map with object value', () => {
        const obs = observable({ test: new Map([['key', { a: 0 }]]) });
        obs.test.set('key2', { a: 1 });
        expect(obs.test.get()).toEqual(
            new Map([
                ['key', { a: 0 }],
                ['key2', { a: 1 }],
            ]),
        );
    });
    test('Map get like object', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });

        expect(isObservable(obs.test)).toEqual(true);
        expect(isObservable(obs.test['key'])).toEqual(true);
        expect(obs.test['key'].get()).toEqual('value');
        expect(obs.test.get()).toBeInstanceOf(Map);
    });
    test('Map get optimized', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });

        // Map get
        expect(obs.test.get(optimized as any)).toEqual(new Map([['key', 'value']]));
    });
    test('Map set notifies', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });
        const handler = expectChangeHandler(obs.test);
        const handler2 = expectChangeHandler(obs);
        const handlerOptimized = expectChangeHandler(obs.test, optimized);

        // Map get
        obs.test.set('key2', 'value2');
        expect(handler).toHaveBeenCalledWith(
            new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
            new Map([
                ['key', 'value'],
                ['key2', undefined],
            ]),
            [{ path: ['key2'], pathTypes: ['object'], prevAtPath: undefined, valueAtPath: 'value2' }],
        );
        expect(handlerOptimized).toHaveBeenCalledWith(
            new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
            new Map([
                ['key', 'value'],
                ['key2', undefined],
            ]),
            [{ path: ['key2'], pathTypes: ['object'], prevAtPath: undefined, valueAtPath: 'value2' }],
        );
        expect(handler2).toHaveBeenCalledWith(
            {
                test: new Map([
                    ['key', 'value'],
                    ['key2', 'value2'],
                ]),
            },
            {
                test: new Map([
                    ['key', 'value'],
                    ['key2', undefined],
                ]),
            },
            [{ path: ['test', 'key2'], pathTypes: ['map', 'object'], prevAtPath: undefined, valueAtPath: 'value2' }],
        );
    });
});

describe('Map is observable', () => {
    test('Map set is observable', () => {
        const obs$ = observable({ test: new Map([['key', 'value']]) });
        const handler = expectChangeHandler(obs$.test.get('key'));
        const handler2 = expectChangeHandler(obs$.test);
        const setRet = obs$.test.set('key', 'value2');
        expect(handler).toHaveBeenCalledWith('value2', 'value', [
            { path: [], pathTypes: [], prevAtPath: 'value', valueAtPath: 'value2' },
        ]);
        expect(handler2).toHaveBeenCalledWith(obs$.test.peek(), new Map([['key', 'value']]), [
            { path: ['key'], pathTypes: ['object'], prevAtPath: 'value', valueAtPath: 'value2' },
        ]);
        expect(setRet === obs$.test).toEqual(true);
    });
    test('Map clear is observable at children', () => {
        const obs = observable({
            test: new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        });
        const handler = expectChangeHandler(obs.test.get('key'));
        obs.test.clear();
        expect(handler).toHaveBeenCalledWith(undefined, 'value', [
            { path: [], pathTypes: [], prevAtPath: 'value', valueAtPath: undefined },
        ]);
    });
    test('Map clear is observable at root', () => {
        const obs = observable({
            test: new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        });
        const prev = new Map([
            ['key', 'value'],
            ['key2', 'value2'],
        ]);
        const handler = expectChangeHandler(obs.test);
        obs.test.clear();
        expect(handler).toHaveBeenCalledWith(new Map(), prev, [
            { path: [], pathTypes: [], prevAtPath: prev, valueAtPath: new Map() },
        ]);
    });
    test('Map gets value', () => {
        const obsWithChild = observable({
            test: new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        });
        const obs = observable(
            new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        );

        const valueChild = obsWithChild.test.get('key').get();
        expect(valueChild).toEqual('value');

        const value = obs.get('key').get();
        expect(value).toEqual('value');
    });
    test('Map size', () => {
        const obs = observable(
            new Map([
                ['key', 'value'],
                ['key2', 'value2'],
            ]),
        );

        const size = obs.size;

        expect(size).toEqual(2);
    });
    test('Map observe size', () => {
        let lastValue: number | undefined = undefined;
        const obs$ = observable(new Map([['key', 'value']]));

        observe(() => {
            lastValue = obs$.size;
        });
        expect(lastValue).toEqual(1);
        obs$.set('key2', 'value2');
        expect(lastValue).toEqual(2);
        obs$.delete('key');
        expect(lastValue).toEqual(1);
    });
});

describe('Set default behavior', () => {
    test('Set delete', () => {
        const obs = observable({ test: new Set(['key', 'key2']) });
        obs.test.delete('key');

        // Set has
        expect(obs.test.has('key')).toEqual(false);
        expect(obs.test.has('key2')).toEqual(true);
    });
    test('Set clear', () => {
        const obs = observable({ test: new Set(['key', 'key2']) });
        obs.test.clear();

        // Set has
        expect(obs.test.has('key')).toEqual(false);
        expect(obs.test.has('key2')).toEqual(false);
    });
    test('Set add is observable', () => {
        const obs = observable({ test: new Set(['key']) });
        const handler = expectChangeHandler(obs.test);
        const added = obs.test.add('key2');
        expect(handler).toHaveBeenCalledWith(new Set(['key', 'key2']), new Set(['key']), [
            { path: [], pathTypes: [], prevAtPath: new Set(['key']), valueAtPath: new Set(['key', 'key2']) },
        ]);
        expect(added === obs.test).toEqual(true);
    });
    test('Set size is observable', () => {
        const obs$ = observable({ test: new Set(['key']) });
        expect(obs$.test.size).toEqual(1);

        let lastValue: number | undefined = undefined;

        observe(() => {
            lastValue = obs$.test.size;
        });
        expect(lastValue).toEqual(1);
        obs$.test.add('key2');
        expect(lastValue).toEqual(2);
        obs$.test.delete('key');
        expect(lastValue).toEqual(1);
    });
    test('Set overwrite with new set', () => {
        const obs = observable(new Set(['key']));
        const handler = expectChangeHandler(obs);
        obs.set(new Set(['key', 'key2']));

        expect(handler).toHaveBeenCalledWith(new Set(['key', 'key2']), new Set(['key']), [
            { path: [], pathTypes: [], prevAtPath: new Set(['key']), valueAtPath: new Set(['key', 'key2']) },
        ]);

        // Set has
        expect(obs.has('key')).toEqual(true);
        expect(obs.has('key2')).toEqual(true);
    });
});

describe('Map/Set pathTypes', () => {
    test('Map changes have correct previous and pathTypes', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });
        const handler = expectChangeHandler(obs);

        obs.test.set('key', 'value2');

        expect(handler).toHaveBeenCalledWith(
            { test: new Map([['key', 'value2']]) },
            { test: new Map([['key', 'value']]) },
            [{ path: ['test', 'key'], pathTypes: ['map', 'object'], prevAtPath: 'value', valueAtPath: 'value2' }],
        );
    });
    test('Set changes have correct previous and pathTypes', () => {
        const obs = observable({ test: new Set(['key1', 'key2']) });
        const handler = expectChangeHandler(obs);

        obs.test.add('key3');

        expect(handler).toHaveBeenCalledWith(
            { test: new Set(['key1', 'key2', 'key3']) },
            { test: new Set(['key1', 'key2']) },
            [
                {
                    path: ['test'],
                    pathTypes: ['set'],
                    prevAtPath: new Set(['key1', 'key2']),
                    valueAtPath: new Set(['key1', 'key2', 'key3']),
                },
            ],
        );
    });
    test('mergeIntoObservable with Map', () => {
        const obs = observable({ test: undefined as unknown as Map<string, any> });

        mergeIntoObservable(obs, { test: new Map([['key', 'value']]) });
        expect(obs.test.peek()).toEqual(new Map([['key', 'value']]));
    });
    test('Set as computed', () => {
        let lastSetValue: Set<string> | undefined = undefined;
        const fileNames = observable<string[]>([]);

        const fileNamesSet = observable(() => {
            return new Set(fileNames.get());
        });

        observe(() => {
            fileNames.get();
        });

        observe(() => {
            lastSetValue = fileNamesSet.get();
        });

        expect(lastSetValue).toEqual(new Set());

        fileNames.push('hi1');

        expect(lastSetValue).toEqual(new Set(['hi1']));

        fileNames.push('hi2');

        expect(lastSetValue).toEqual(new Set(['hi1', 'hi2']));
    });
});

describe('Collection membership with undefined values', () => {
    test.each(['insert', 'delete'] as const)('Map %s changes membership and notifies once', (operation) => {
        const obs = observable({
            entries: new Map<string, undefined>(operation === 'delete' ? [['x', undefined]] : []),
        });
        const normal = jest.fn();
        const shallow = jest.fn();
        const optimizedHandler = jest.fn();
        const child = jest.fn();
        obs.entries.onChange(normal);
        obs.entries.onChange(shallow, { trackingType: true });
        obs.entries.onChange(optimizedHandler, { trackingType: optimized });
        obs.entries.get('x').onChange(child);
        const mutate = () => (operation === 'delete' ? obs.entries.delete('x') : obs.entries.set('x', undefined));
        const result = mutate();
        expect(obs.entries.peek().has('x')).toBe(operation === 'insert');
        if (operation === 'delete') expect(result).toBe(true);
        for (const handler of [normal, shallow, optimizedHandler, child]) expect(handler).toHaveBeenCalledTimes(1);
        mutate();
        for (const handler of [normal, shallow, optimizedHandler, child]) expect(handler).toHaveBeenCalledTimes(1);
        if (operation === 'delete') expect(obs.entries.delete('x')).toBe(false);
    });
    test('Map root inserts and deletes an undefined entry', () => {
        const obs = observable(new Map<string, undefined>());
        obs.set('x', undefined);
        expect(obs.peek().has('x')).toBe(true);
        expect(obs.delete('x')).toBe(true);
        expect(obs.peek().has('x')).toBe(false);
        expect(obs.delete('x')).toBe(false);
    });
    test('Set deletes undefined membership and reports absent members', () => {
        const obs = observable(new Set<undefined>([undefined]));
        expect(obs.delete(undefined)).toBe(true);
        expect(obs.peek().has(undefined)).toBe(false);
        expect(obs.delete(undefined)).toBe(false);
    });
});
describe('Explicit undefined collection keys', () => {
    test('Map deletes an undefined key without replacing the root', () => {
        const obs = observable(
            new Map<any, undefined>([
                [undefined, undefined],
                ['other', undefined],
            ]),
        );
        expect(obs.delete(undefined)).toBe(true);
        expect(obs.peek()).toBeInstanceOf(Map);
        expect(obs.peek().has(undefined)).toBe(false);
        expect(obs.peek().has('other')).toBe(true);
        expect(obs.delete(undefined)).toBe(false);
    });
    test('Set absent deletion reports false', () => {
        const obs = observable(new Set(['x']));
        expect(obs.delete('missing')).toBe(false);
        expect(obs.peek()).toEqual(new Set(['x']));
    });
});
