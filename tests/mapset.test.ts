/* eslint-disable @typescript-eslint/no-empty-function */
import { isObservable } from '../src/is';
import { observable } from '../src/observable';
import { Change, ObservableReadable, TrackingType } from '../src/observableInterfaces';

function expectChangeHandler<T>(obs: ObservableReadable<T>, track?: TrackingType) {
    const ret = jest.fn();

    function handler({ value, getPrevious, changes }: { value: any; getPrevious: () => any; changes: Change[] }) {
        const prev = getPrevious();

        ret(value, prev, changes);
    }

    obs.onChange(handler, { trackingType: track });

    return ret;
}

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
});

describe('Map is observable', () => {
    test('Map set is observable', () => {
        const obs = observable({ test: new Map([['key', 'value']]) });
        const handler = expectChangeHandler(obs.test.get('key'));
        const handler2 = expectChangeHandler(obs.test);
        obs.test.set('key', 'value2');
        expect(handler).toHaveBeenCalledWith('value2', 'value', [
            { path: [], pathTypes: [], prevAtPath: 'value', valueAtPath: 'value2' },
        ]);
        expect(handler2).toHaveBeenCalledWith(obs.test.peek(), { key: 'value' }, [
            { path: ['key'], pathTypes: ['object'], prevAtPath: 'value', valueAtPath: 'value2' },
        ]);
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
});

describe('Set default behavior', () => {
    test('Set delete', () => {
        const obs = observable({ test: new Set(['key', 'key2']) });
        obs.test.delete('key');

        // Set has
        expect(obs.test.has('key')).toEqual(false);
        expect(obs.test.has('key2')).toEqual(true);
    });
    test('Set add is observable', () => {
        const obs = observable({ test: new Set(['key']) });
        const handler = expectChangeHandler(obs.test);
        obs.test.add('key2');
        expect(handler).toHaveBeenCalledWith(new Set(['key', 'key2']), new Set(['key']), [
            { path: [], pathTypes: [], prevAtPath: new Set(['key']), valueAtPath: new Set(['key', 'key2']) },
        ]);
    });
});
