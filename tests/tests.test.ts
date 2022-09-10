import { computed } from '../src/computed';
import { effect } from '../src/effect';
import { isObservable, lockEdits } from '../src/helpers';
import { observable } from '../src/observable';
import { beginBatch, endBatch } from '../src/batching';
import { event } from '../src/event';
import { ObservableRef } from '../src/observableInterfaces';
import { when } from '../src/when';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

let spiedConsole: jest.SpyInstance;

beforeAll(() => {
    spiedConsole = jest.spyOn(global.console, 'error').mockImplementation(() => {});
});
afterAll(() => {
    spiedConsole.mockRestore();
});

function expectChangeHandler(obs: ObservableRef, options?: { shallow?: boolean; runImmediately?: boolean }) {
    const ret = jest.fn();

    function handler(value, getPrev: () => any, path: string[], valueAtPath: any, prevAtPath: any) {
        const prev = getPrev();

        ret(value, prev, path, valueAtPath, prevAtPath);
    }

    obs.onChange(handler, options);

    return ret;
}

describe('Set', () => {
    test('Set', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.set({ text: 't2' });
        expect(obs.test.get()).toEqual({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set primitive', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.text.set('t2');
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set prop', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.set('text', 't2');
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set child', () => {
        const obs = observable({ test: { text: { text2: 't' } } });
        obs.test.text.set({ text2: 't2' });
        expect(obs).toEqual({ test: { text: { text2: 't2' } } });
    });
    test('Set in array', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        obs.arr.set([{ text: 'hi2' }]);
        expect(obs.arr.length).toEqual(1);

        expect(obs.arr.get()).toEqual([{ text: 'hi2' }]);
        expect(obs.arr[0].text).toEqual('hi2');
        obs.arr[0].text.set('hi3');
        expect(obs.arr[0].text).toEqual('hi3');
        expect(obs.arr.map((a) => a)).toEqual([{ text: 'hi3' }]);
    });
    test('Set at root', () => {
        const obs = observable({ test: { text: 't' } });
        obs.set({ test: { text: 't2' } });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set empty object at root', () => {
        const obs = observable({ test: { text: 't' } } as Record<string, any>);
        obs.set({});
        expect(obs).toEqual({});
        expect(obs.get()).toEqual({});
    });
    test('Set at root deletes other properties', () => {
        const obs = observable({ test: { text: 't' }, test2: 'hello' });
        // @ts-expect-error
        obs.set({ test: { text: 't2' } });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set array at root', () => {
        const obs = observable([1, 2, 3]);
        obs.set([1, 2]);
        expect(obs.get()).toEqual([1, 2]);
    });
    test('Set value does not copy object', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toBe(newVal);
    });
    test('Multiple sets does not cleanup existing nodes', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });

        const handler = expectChangeHandler(obs.arr);

        obs.arr.set([{ text: 'hi2' }]);

        expect(handler).toHaveBeenCalledWith(
            [{ text: 'hi2' }],
            [{ text: 'hi' }],
            [],
            [{ text: 'hi2' }],
            [{ text: 'hi' }]
        );

        const setVal = obs.arr.set([{ text: 'hello' }]);
        expect(setVal.get()).toEqual([{ text: 'hello' }]);

        expect(obs.arr.get()).toEqual([{ text: 'hello' }]);

        expect(handler).toHaveBeenCalledWith(
            [{ text: 'hello' }],
            [{ text: 'hi2' }],
            [],
            [{ text: 'hello' }],
            [{ text: 'hi2' }]
        );
    });
    test('Set with function', () => {
        const obs = observable({ test: { num: 1 } });
        obs.test.num.set((n) => n + 1);
        expect(obs.test.get()).toEqual({ num: 2 });
    });
    test('Set prop with function', () => {
        const obs = observable({ test: { num: 1 } });
        obs.test.set('num', (n) => n + 1);
        expect(obs.test.get()).toEqual({ num: 2 });
    });
    test("Set with child that's an observable", () => {
        const obsOther = observable({ a: { b: 'hi' } });
        const obs = observable({ test: { t: { text2: 't' } } } as Record<string, any>);
        obs.test.set({ t: obsOther });
        expect(obs.get()).toEqual({ test: { t: { a: { b: 'hi' } } } });
        expect(obs).toEqual({ test: { t: { a: { b: 'hi' } } } });
        obs.test.set({ t: { tt: obsOther.a } });
        expect(obs.get()).toEqual({ test: { t: { tt: { b: 'hi' } } } });
        expect(obs).toEqual({ test: { t: { tt: { b: 'hi' } } } });
        expect(obs.test.t.tt.get()).toEqual({ b: 'hi' });
    });
});
describe('Assign', () => {
    test('Assign', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.assign({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Assign more keys', () => {
        const obs = observable<Record<string, any>>({ test: { text: 't' } });
        obs.test.assign({ text: 'tt', text2: 'tt2' });
        expect(obs).toEqual({ test: { text: 'tt', text2: 'tt2' } });
    });
});
describe('Listeners', () => {
    test('Listen', () => {
        const obs = observable({ test: { text: 't' }, arr: [] });
        const handler = expectChangeHandler(obs.test);
        const handler2 = expectChangeHandler(obs);

        obs.test.set({ text: 't2' });
        expect(handler).toHaveBeenCalledWith({ text: 't2' }, { text: 't' }, [], { text: 't2' }, { text: 't' });
        expect(handler2).toHaveBeenCalledWith(
            { test: { text: 't2' }, arr: [] },
            { test: { text: 't' }, arr: [] },
            ['test'],
            { text: 't2' },
            { text: 't' }
        );
    });
    test('Listen by ref', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = expectChangeHandler(obs.test.obs('text'));
        obs.test.set('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't', [], 't2', 't');
    });
    test('Listen by key', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = expectChangeHandler(obs.test.text);
        obs.test.set('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't', [], 't2', 't');
    });
    test('Listen deep', () => {
        const obs = observable({ test: { test2: { test3: { text: 't' } } } });
        const handler = expectChangeHandler(obs.test.test2.test3.text);
        const handler2 = expectChangeHandler(obs);

        obs.test.test2.test3.text.set('t2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't', [], 't2', 't');
        expect(handler2).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { test: { test2: { test3: { text: 't' } } } },
            ['test', 'test2', 'test3', 'text'],
            't2',
            't'
        );
    });
    test('Listen calls multiple times', () => {
        const obs = observable({ test: { test2: { test3: { text: 't' } } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.test3.text.set('t2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { test: { test2: { test3: { text: 't' } } } },
            ['test', 'test2', 'test3', 'text'],
            't2',
            't'
        );
        obs.test.test2.test3.text.set('t3');
        expect(obs.test.test2.test3.text).toEqual('t3');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't3' } } } },
            { test: { test2: { test3: { text: 't2' } } } },
            ['test', 'test2', 'test3', 'text'],
            't3',
            't2'
        );
    });
    test('Set calls and maintains deep listeners', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const handler = expectChangeHandler(obs.test.test2);
        obs.test.set({ test2: 'hello' });
        expect(handler).toHaveBeenCalledWith('hello', 'hi', [], 'hello', 'hi');
        obs.test.set({ test2: 'hi there' });
        expect(obs.test.test2).toEqual('hi there');
        expect(handler).toHaveBeenCalledWith('hi there', 'hello', [], 'hi there', 'hello');
    });
    test('Set on root calls deep listeners', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const handler = expectChangeHandler(obs.test.test2);
        obs.set({ test: { test2: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', 'hi', [], 'hello', 'hi');
    });
    test('Shallow listener', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });

        const handler = expectChangeHandler(obs.test, { shallow: true });
        const handler2 = expectChangeHandler(obs, { shallow: true });

        obs.test.test2.test3.set('hello');
        expect(handler).not.toHaveBeenCalled();
        obs.test.set({ test2: { test3: 'hello' } });
        expect(handler).toHaveBeenCalledTimes(1);
        // Assign adding a new property does notify
        obs.test.assign({ test4: 'hello' } as any);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler2).toHaveBeenCalledTimes(0);
    });
    test('Listener called for each change', () => {
        const obs = observable({ test: { val: 10 } });
        const handler = expectChangeHandler(obs.test);
        expect(handler).not.toHaveBeenCalled();
        obs.test.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { val: 10 }, [], { val: 20 }, { val: 10 });
        obs.test.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { val: 20 }, [], { val: 21 }, { val: 20 });
        obs.test.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { val: 21 }, [], { val: 22 }, { val: 21 });
        obs.test.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { val: 22 }, [], { val: 23 }, { val: 22 });
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener called for each change at root', () => {
        const obs = observable({ val: 10 });
        const handler = expectChangeHandler(obs);
        expect(handler).not.toHaveBeenCalled();
        obs.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { val: 10 }, [], { val: 20 }, { val: 10 });
        obs.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { val: 20 }, [], { val: 21 }, { val: 20 });
        obs.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { val: 21 }, [], { val: 22 }, { val: 21 });
        obs.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { val: 22 }, [], { val: 23 }, { val: 22 });
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener with key fires only for key', () => {
        const obs = observable({ val: { val2: 10 }, val3: 'hello' });
        const handler = expectChangeHandler(obs.val);
        obs.val.val2.set(20);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { val2: 10 }, ['val2'], 20, 10);
        obs.val3.set('hihi');
        obs.val3.set('hello again');
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Object listener', () => {
        const obs = observable({ test: 'hi' });
        const handler = expectChangeHandler(obs);
        obs.test.set('hello');
        expect(handler).toHaveBeenCalledWith({ test: 'hello' }, { test: 'hi' }, ['test'], 'hello', 'hi');
    });
    test('Deep object listener', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.test3.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { test: { test2: { test3: 'hi' } } },
            ['test', 'test2', 'test3'],
            'hello',
            'hi'
        );
    });
    test('Deep object set primitive undefined', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.test3.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: undefined } } },
            { test: { test2: { test3: 'hi' } } },
            ['test', 'test2', 'test3'],
            undefined,
            'hi'
        );
    });
    test('Deep object set undefined', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: undefined } },
            { test: { test2: { test3: 'hi' } } },
            ['test', 'test2'],
            undefined,
            { test3: 'hi' }
        );
    });
    test('Start null set to something', () => {
        const obs = observable({ test: null });
        const handler = expectChangeHandler(obs);
        obs.set('test', { test2: 'hi' });
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi' } },
            { test: null },
            ['test'],
            {
                test2: 'hi',
            },
            null
        );
    });
    test('Start undefined set to something', () => {
        const obs = observable({ test: undefined });
        const handler = expectChangeHandler(obs);
        obs.set('test', { test2: 'hi' });
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi' } },
            { test: undefined },
            ['test'],
            {
                test2: 'hi',
            },
            undefined
        );
    });
    test('Set with object should only fire listeners once', () => {
        const obs = observable({ test: undefined });
        const handler = expectChangeHandler(obs);
        obs.set('test', { test2: 'hi', test3: 'hi3', test4: 'hi4' });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi', test3: 'hi3', test4: 'hi4' } },
            { test: undefined },
            ['test'],
            { test2: 'hi', test3: 'hi3', test4: 'hi4' },
            undefined
        );
    });
    test('Listener promises', async () => {
        const obs = observable({ test: 'hi' });
        const promise = when(() => obs.test === 'hi2');
        let didResolve = false;
        promise.then(() => (didResolve = true));
        expect(didResolve).toEqual(false);
        await promiseTimeout(16);
        obs.test.set('hi2');
        await promiseTimeout(16);
        expect(didResolve).toEqual(true);
    });
    test('Path to change is correct at every level ', () => {
        const obs = observable({ test1: { test2: { test3: { test4: '' } } } });
        const handlerRoot = expectChangeHandler(obs);
        const handler1 = expectChangeHandler(obs.test1);
        const handler2 = expectChangeHandler(obs.test1.test2);
        const handler3 = expectChangeHandler(obs.test1.test2.test3);
        const handler4 = expectChangeHandler(obs.test1.test2.test3.test4);
        obs.test1.test2.test3.test4.set('hi');
        expect(handlerRoot).toHaveBeenCalledWith(
            { test1: { test2: { test3: { test4: 'hi' } } } },
            { test1: { test2: { test3: { test4: '' } } } },
            ['test1', 'test2', 'test3', 'test4'],
            'hi',
            ''
        );
        expect(handler1).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi' } } },
            { test2: { test3: { test4: '' } } },
            ['test2', 'test3', 'test4'],
            'hi',
            ''
        );
        expect(handler2).toHaveBeenCalledWith(
            { test3: { test4: 'hi' } },
            { test3: { test4: '' } },
            ['test3', 'test4'],
            'hi',
            ''
        );
        expect(handler3).toHaveBeenCalledWith({ test4: 'hi' }, { test4: '' }, ['test4'], 'hi', '');
        expect(handler4).toHaveBeenCalledWith('hi', '', [], 'hi', '');
    });
    test('Set with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = expectChangeHandler(obs.obj.test);
        obs.set({ obj: { test: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', 'hi', [], 'hello', 'hi');
    });
    test('Set undefined deep with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = expectChangeHandler(obs.obj.test);
        obs.obj.set('test', undefined);
        expect(handler).toHaveBeenCalledWith(undefined, 'hi', [], undefined, 'hi');
    });
    test('Modify value does not copy object', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toBe(newVal);
    });
    test('set returns correct value', () => {
        const obs = observable({ test: '' });
        const ret = obs.set({ test: 'hello' });
        expect(ret).toEqual({ test: 'hello' });
        const ret2 = obs.test.set('hello');
        expect(ret2.get()).toEqual('hello');
        expect(obs.test).toEqual('hello');
        const ret3 = obs.assign({ test: 'hello2' });
        expect(obs.test).toEqual('hello2');
        expect(ret3).toEqual({ test: 'hello2' });
        expect(obs).toEqual({ test: 'hello2' });
    });
    test('undefined is undefined', () => {
        const obs = observable({ test: undefined });
        expect(obs.test).toEqual(undefined);
    });
    test('Set undefined to value and back', () => {
        const obs = observable({ test: { test2: { test3: undefined } } });
        const handler = expectChangeHandler(obs.test);
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test.test2.test3).toEqual(undefined);
        obs.test.test2.set('test3', { test4: 'hi4', test5: 'hi5' });
        expect(obs.test.test2.test3).toEqual({ test4: 'hi4', test5: 'hi5' });
        expect(obs.test.test2).toEqual({ test3: { test4: 'hi4', test5: 'hi5' } });
        expect(obs.test).toEqual({ test2: { test3: { test4: 'hi4', test5: 'hi5' } } });
        expect(obs).toEqual({ test: { test2: { test3: { test4: 'hi4', test5: 'hi5' } } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi4', test5: 'hi5' } } },
            { test2: { test3: undefined } },
            ['test2', 'test3'],
            { test4: 'hi4', test5: 'hi5' },
            undefined
        );
        obs.test.test2.set('test3', undefined);
        expect(obs.test.test2.test3).toEqual(undefined);
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs).toEqual({ test: { test2: { test3: undefined } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: undefined } },
            { test2: { test3: { test4: 'hi4', test5: 'hi5' } } },
            ['test2', 'test3'],
            undefined,
            { test4: 'hi4', test5: 'hi5' }
        );
        obs.test.test2.set('test3', { test4: 'hi6', test5: 'hi7' });
        expect(obs.test.test2.test3).toEqual({ test4: 'hi6', test5: 'hi7' });
        expect(obs.test.test2).toEqual({ test3: { test4: 'hi6', test5: 'hi7' } });
        expect(obs.test).toEqual({ test2: { test3: { test4: 'hi6', test5: 'hi7' } } });
        expect(obs).toEqual({ test: { test2: { test3: { test4: 'hi6', test5: 'hi7' } } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi6', test5: 'hi7' } } },
            { test2: { test3: undefined } },
            ['test2', 'test3'],
            { test4: 'hi6', test5: 'hi7' },
            undefined
        );
    });
    test('Set deep primitive undefined to value and back', () => {
        const obs = observable({ test: { test2: { test3: undefined } } });
        const handler = expectChangeHandler(obs.test);
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test.test2.test3).toEqual(undefined);
        obs.test.test2.set('test3', 'hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2).toEqual({ test3: 'hi' });
        expect(obs.test).toEqual({ test2: { test3: 'hi' } });
        expect(obs).toEqual({ test: { test2: { test3: 'hi' } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi' } },
            { test2: { test3: undefined } },
            ['test2', 'test3'],
            'hi',
            undefined
        );
        obs.test.test2.set('test3', undefined);
        expect(obs.test.test2.test3).toEqual(undefined);
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs).toEqual({ test: { test2: { test3: undefined } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: undefined } },
            { test2: { test3: 'hi' } },
            ['test2', 'test3'],
            undefined,
            'hi'
        );
        obs.test.test2.set('test3', 'hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2).toEqual({ test3: 'hi' });
        expect(obs.test.test2).toEqual({ test3: 'hi' });
        expect(obs.test).toEqual({ test2: { test3: 'hi' } });
        expect(obs).toEqual({ test: { test2: { test3: 'hi' } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi' } },
            { test2: { test3: undefined } },
            ['test2', 'test3'],
            'hi',
            undefined
        );
        obs.test.test2.set({ test3: 'hi2' });
        expect(obs.test.test2.test3).toEqual('hi2');
        expect(obs.test.test2.test3).toEqual('hi2');
        expect(obs.test.test2).toEqual({ test3: 'hi2' });
        expect(obs.test.test2).toEqual({ test3: 'hi2' });
        expect(obs.test).toEqual({ test2: { test3: 'hi2' } });
        expect(obs).toEqual({ test: { test2: { test3: 'hi2' } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi2' } },
            { test2: { test3: 'hi' } },
            ['test2'],
            { test3: 'hi2' },
            { test3: 'hi' }
        );
    });
    test('Set number key', () => {
        const obs = observable({ test: {} as Record<number, string> });
        const handler = expectChangeHandler(obs.test);
        obs.test.set(1, 'hi');
        expect(handler).toHaveBeenCalledWith({ '1': 'hi' }, { '1': undefined }, [1], 'hi', undefined);
    });
    test('Set number key multiple times', () => {
        const obs = observable({ test: { t: {} as Record<number, any> } });
        const handler = expectChangeHandler(obs.test);
        obs.test.t.set(1000, { test1: { text: ['hi'] } });
        expect(obs.get()).toEqual({
            test: {
                t: {
                    '1000': {
                        test1: { text: ['hi'] },
                    },
                },
            },
        });
        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hi'] } } } },
            { t: { 1000: undefined } },
            ['t', 1000],
            { test1: { text: ['hi'] } },
            undefined
        );
        expect(Object.keys(obs.test.t[1000])).toEqual(['test1']);
        obs.test.t[1000].set({ test1: { text: ['hi'] }, test2: { text: ['hi2'] } });
        expect(obs.get()).toEqual({
            test: {
                t: {
                    '1000': {
                        test1: { text: ['hi'] },
                        test2: { text: ['hi2'] },
                    },
                },
            },
        });
        expect(Object.keys(obs.test.t['1000'])).toEqual(['test1', 'test2']);
        expect(Object.keys(obs.test.t['1000'])).toEqual(['test1', 'test2']);
        expect(Object.keys(obs.test.t[1000])).toEqual(['test1', 'test2']);
        expect(obs.test.t.get()).toEqual({
            1000: {
                test1: { text: ['hi'] },
                test2: { text: ['hi2'] },
            },
        });
        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } } } },
            { t: { 1000: { test1: { text: ['hi'] } } } },
            ['t', 1000],
            { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
            { test1: { text: ['hi'] } }
        );
        obs.test.t.set(1000, { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } });
        expect(obs.test.t.get()).toEqual({
            1000: {
                test1: { text: ['hiz'], text2: 'hiz2' },
                test2: { text: ['hi2'] },
            },
        });
        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } } } },
            { t: { 1000: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } } } },
            ['t', 1000],
            { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } },
            { test1: { text: ['hi'] }, test2: { text: ['hi2'] } }
        );
    });
    test('Set does not fire if unchanged', () => {
        const obs = observable({ test: { test1: 'hi' } });
        const handler = jest.fn();
        obs.test.onChange(handler);
        obs.test.set('test1', 'hi');
        obs.test.test1.set('hi');
        expect(handler).toHaveBeenCalledTimes(0);
    });
    test('Primitive has no keys', () => {
        const obs = observable({ val: 10 });
        expect(Object.keys(obs.val)).toEqual([]);
    });
    test('Set key on undefined fails', () => {
        const obs = observable({ val: undefined });
        expect(() => {
            obs.val.set('key', 10);
        }).toThrow();
        expect(obs.val).toEqual(undefined);
    });
});
describe('Equality', () => {
    test('Equality', () => {
        const obs = observable({ val: { val2: 10 } });
        const v = { val2: 20 };
        obs.val.set(v);
        expect(obs.val.get() === v).toEqual(true);
        expect(obs.val.get() == v).toEqual(true);
    });
    test('Set with same object still notifies', () => {
        const obs = observable({ test: { text: 'hi' } });
        const handler = expectChangeHandler(obs.test);
        const test = obs.test.get();
        obs.test.set(obs.test.get());
        expect(obs.test.get()).toBe(test);
        expect(handler).toHaveBeenCalledWith({ text: 'hi' }, { text: 'hi' }, [], { text: 'hi' }, { text: 'hi' });
    });
    test('Set with same array notifies', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        const handler = expectChangeHandler(obs.arr);
        const arr = obs.arr.get();
        obs.arr.set(obs.arr.get());
        expect(obs.arr.get()).toBe(arr);
        expect(handler).toHaveBeenCalled();
    });
});
describe('Safety', () => {
    test('Writes are ok in unsafe', () => {
        const obs = observable({ test: { text: 't' } }, false);
        obs.test.text = 'hello';
        obs.test = { text: 'hello' };
        delete obs.test;
    });
    test('Prevent object writes in default safety', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.text = 'hello';
        expect(() => {
            // @ts-expect-error
            obs.test = { text: 'hello' };
        }).toThrow();
        expect(() => {
            // @ts-expect-error
            delete obs.test;
        }).toThrow();
    });
    test('Prevent writes in safe', () => {
        const obs = observable({ test: { text: 't' } }, true);
        expect(() => {
            // @ts-expect-error
            obs.test.text = 'hello';
        }).toThrow();
        expect(() => {
            // @ts-expect-error
            obs.test = { text: 'hello' };
        }).toThrow();
        expect(() => {
            // @ts-expect-error
            delete obs.test;
        }).toThrow();
    });
    test('Observable functions always work', () => {
        const obs = observable({ get: 'hi', assign: 'hi' });
        expect(typeof obs.get === 'function').toBe(true);
        expect(typeof obs.assign === 'function').toBe(true);
        obs.set({ get: 'hello', assign: 'hi' });
        expect(typeof obs.get === 'function').toBe(true);
        expect(typeof obs.assign === 'function').toBe(true);
    });
});
describe('Primitives', () => {
    test('Primitive set', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        obs.test.text.set('t2');
        expect(obs.test.text).toEqual('t2');
    });
    test('Deep primitive access', () => {
        const obs = observable({ val: { val2: { val3: 10 } } });
        expect(obs.val.val2.val3).toEqual(10);
        obs.val.val2.val3.set(20);
        expect(obs.val.val2.val3).toEqual(20);
        expect(obs.val.val2.val3.get()).toEqual(20);
    });
    test('observable root can be primitive', () => {
        const obs = observable(10);
        expect(obs.value).toEqual(10);
        obs.set(20);
        expect(obs.value).toEqual(20);
    });
    test('set value on observable notifies', () => {
        const obs = observable(10);
        expect(obs.value).toEqual(10);
        const handler = expectChangeHandler(obs);
        obs.value = 20;
        expect(obs.value).toEqual(20);
        expect(handler).toHaveBeenCalledWith(20, 10, [], 20, 10);
    });
    test('Primitive callback does not have value', () => {
        const obs = observable(10);
        const handler = expectChangeHandler(obs);
        obs.onChange(handler);
        obs.set(20);
        expect(handler).toHaveBeenCalledWith(20, 10, [], 20, 10);
    });
    test('Set function with obs is stable', () => {
        const obs = observable({ num1: 10, num2: 20 });
        const set = obs.obs('num1').set;
        expect(obs.num2).toEqual(20);

        set(30);

        expect(obs.num1).toEqual(30);
    });
    test('Assign on a primitive errors', async () => {
        const obs = observable({ num1: 10, num2: 20 });

        expect(() => {
            // @ts-expect-error
            obs.num1.assign({ value: 'hi' });
            // @ts-expect-error
            obs.num1.assign;
        }).toThrow();

        // This error will leave observableBatch in progress, so force end it
        endBatch(true);
    });
});
describe('Array', () => {
    test('Basic array', () => {
        const obs = observable({ arr: [] });
        expect(obs.arr.get()).toEqual([]);
        obs.arr.set([1, 2, 3]);
        expect(obs.arr.get()).toEqual([1, 2, 3]);
    });
    test('Array at root', () => {
        const obs = observable([]);
        expect(obs.get()).toEqual([]);
        obs.set([1, 2, 3]);
        expect(obs.get()).toEqual([1, 2, 3]);
    });
    test('Array functions', () => {
        const obs = observable({ arr: [] });
        const handler = jest.fn();
        obs.arr.onChange(handler);
    });
    test('Array map runs on proxies', () => {
        const obs = observable({ arr: [1, 2] });

        expect(obs.arr.map((a) => a.get())).toEqual([1, 2]);
    });
    test('Array push', () => {
        const obs = observable({ test: ['hi'] });
        const handler = expectChangeHandler(obs);

        obs.test.push('hello');
        expect(obs.test.get()).toEqual(['hi', 'hello']);
        expect(handler).toHaveBeenCalledWith(
            { test: ['hi', 'hello'] },
            { test: ['hi'] },
            ['test'],
            ['hi', 'hello'],
            ['hi']
        );
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Array splice', () => {
        const obs = observable({ test: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }] });
        const handler = expectChangeHandler(obs);
        const last = obs.test[2].get();
        obs.test.splice(1, 1);
        expect(obs.test.get()).toEqual([{ text: 'hi' }, { text: 'there' }]);
        expect(obs.test[1]).toEqual(last);
        expect(obs.test[1].get()).toBe(last);
        expect(handler).toHaveBeenCalledWith(
            { test: [{ text: 'hi' }, { text: 'there' }] },
            { test: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }] },
            ['test'],
            [{ text: 'hi' }, { text: 'there' }],
            [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }]
        );
        expect(handler).toHaveBeenCalledTimes(1);
    });
    // test('Array of objects requires ids', () => {
    //     const obs = observable({ test: [{ text: 'hi' }] });
    // });
    test('Array swap', () => {
        const obs = observable({ test: [1, 2, 3, 4, 5] });
        let tmp = obs.test[1];
        obs.test.set(1, obs.test[4]);
        obs.test.set(4, tmp);
        expect(obs.test.get()).toEqual([1, 5, 3, 4, 2]);
        tmp = obs.test[1];
        obs.test.set(1, obs.test[4]);
        obs.test.set(4, tmp);
        expect(obs.test.get()).toEqual([1, 2, 3, 4, 5]);
    });
    test('Array set', () => {
        const obs = observable({ test: [] });
        const arr = [];
        for (let i = 0; i < 1000; i++) {
            arr[i] = { id: i };
        }
        obs.test.set(arr);
        expect(obs.test.length).toEqual(1000);
        expect(obs.test[3].id).toEqual(3);
    });
    test('Array swap with objects', () => {
        const obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        let arr = obs.test;
        let tmp = arr[1].get();
        obs.test.set(1, arr[4]);
        obs.test.set(4, tmp);
        expect(obs.test.get()).toEqual([{ text: 1 }, { text: 5 }, { text: 3 }, { text: 4 }, { text: 2 }]);
        expect(obs.test[1]).toEqual({ text: 5 });
        expect(arr[1]).toEqual({ text: 5 });
        expect(obs.test[4]).toEqual({ text: 2 });
        expect(arr[4]).toEqual({ text: 2 });
        tmp = arr[1].get();
        obs.test.set(1, arr[4]);
        obs.test.set(4, tmp);
        expect(obs.test.get()).toEqual([{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
    });
    test('Array swap with objects and then remove', () => {
        const obs = observable({
            test: [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
        });
        let arr = obs.test;
        let tmp = arr[1].get();
        obs.test.set(1, arr[4]);
        obs.test.set(4, tmp);
        obs.test.splice(0, 1);
        expect(obs.test[0].get()).toEqual({ id: 5, text: 5 });
        expect(obs.test[0]).toEqual({ id: 5, text: 5 });
    });
    test('Array swap if empty', () => {
        const obs = observable({ test: [] });
        let tmp = obs.test[1];
        obs.test.set(1, obs.test[4]);
        expect(obs.test.get()).toEqual([undefined, undefined]);
        obs.test.set(4, tmp);
        expect(obs.test.get()).toEqual([undefined, undefined, undefined, undefined, undefined]);
    });
    test('Clear array fires listener once', () => {
        let obs = observable({ arr: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        const handler = jest.fn();
        obs.arr.onChange(handler);
        obs.arr.set([]);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Array clear if listening', () => {
        let obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        obs.test[0].onChange(() => {});
        obs.test[1].onChange(() => {});
        obs.test[2].onChange(() => {});
        obs.test[3].onChange(() => {});
        obs.test[4].onChange(() => {});
        obs.test.set([]);
        expect(obs.test.get()).toEqual([]);
        expect(obs.test.get()).toEqual([]);
        expect(obs.test.length).toEqual(0);
        expect(obs.test.length).toEqual(0);
        expect(obs.test.map((a) => a)).toEqual([]);
    });
    test('Array splice fire events', () => {
        let obs = observable({
            test: [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
        });
        const handler = expectChangeHandler(obs.test);
        obs.test[0].onChange(() => {});
        obs.test[1].onChange(() => {});
        obs.test[2].onChange(() => {});
        obs.test[3].onChange(() => {});
        obs.test[4].onChange(() => {});
        obs.test.splice(0, 1);
        expect(obs.test[0]).toEqual({ id: 2, text: 2 });
        expect(obs.test[0]).toEqual({ id: 2, text: 2 });
        expect(obs.test.get()).toEqual([
            { id: 2, text: 2 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 5, text: 5 },
        ]);
        expect(obs.test.get()).toEqual([
            { id: 2, text: 2 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 5, text: 5 },
        ]);
        expect(obs.test.length).toEqual(4);
        expect(obs.test.length).toEqual(4);
        expect(obs.test.map((a) => a)).toEqual([
            { id: 2, text: 2 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 5, text: 5 },
        ]);
        // TODO
        // expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            [
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
            [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
            [],
            [
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
            [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ]
        );
    });
    test('Array with listeners clear', () => {
        let obs = observable({
            test: [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
        });
        const handler = jest.fn();
        obs.test.onChange(handler, { shallow: true });
        obs.test[0].onChange(() => {});
        obs.test[1].onChange(() => {});
        obs.test[2].onChange(() => {});
        obs.test[3].onChange(() => {});
        obs.test[4].onChange(() => {});
        obs.test.set([]);
    });
    test('Array set by index', () => {
        const obs = observable({ test: [{ text: 'hi' }] });
        obs.test[0].set({ text: 'hi2' });
        expect(obs.test[0]).toEqual({ text: 'hi2' });
    });
    test('Array map returns observables', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        const vals = obs.arr.map((a) => isObservable(a));
        expect(vals).toEqual([true]);
    });
    test('Array forEach returns observables', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        const arr = [];
        obs.arr.forEach((a) => arr.push(isObservable(a)));
        expect(arr).toEqual([true]);
    });
    test('Array splice does not call child listeners', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'h1' },
                { id: 'h2', text: 'h2' },
            ],
        });
        const handler = expectChangeHandler(obs.arr[0]);
        obs.arr.splice(0, 1);
        expect(handler).not.toBeCalled();
    });
    test('Array has stable reference', () => {
        const obs = observable({ arr: [] });
        obs.arr.set([
            { id: 'h1', text: 'hi' },
            { id: 'h2', text: 'hello' },
        ]);
        const second = obs.arr[1];
        const handler = expectChangeHandler(second);
        obs.arr.splice(0, 1);
        obs.arr[0].text.set('hello there');

        expect(handler).toHaveBeenCalledWith(
            { id: 'h2', text: 'hello there' },
            { id: 'h2', text: 'hello' },
            ['text'],
            'hello there',
            'hello'
        );
    });
    test('Array has stable reference 2', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'hi' },
                { id: 'h2', text: 'hello' },
                { id: 'h3', text: 'h3' },
            ],
        });
        const second = obs.arr[1];
        const handler = expectChangeHandler(second);

        // Prep it with proxies
        for (let i = 0; i < obs.arr.length; i++) {
            obs.arr[i].text;
        }

        const arr = obs.arr.get();
        let tmp = arr[1];
        obs.arr.set(1, arr[2]);
        obs.arr.set(2, tmp);
        // This makes second become h3

        expect(handler).toHaveBeenCalledWith(
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' },
            [],
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' }
        );

        obs.arr.splice(0, 1);

        expect(second.get()).toEqual({ id: 'h3', text: 'h3' });
        obs.arr[0].text.set('hello there');

        expect(handler).toHaveBeenCalledWith(
            { id: 'h3', text: 'hello there' },
            { id: 'h2', text: 'hello' },
            [],
            { id: 'h3', text: 'hello there' },
            { id: 'h2', text: 'hello' }
        );
    });
    test('Array has stable references 3', () => {
        const obs = observable({ arr: [] });
        obs.arr.set([
            { id: 'h1', text: 'hi' },
            { id: 'h2', text: 'h2' },
            { id: 'h3', text: 'h3' },
        ]);
        const [first, second, third] = obs.arr.map((a) => a);
        const [firstID, secondID, thirdID] = obs.arr.map((a) => a.id);
        const handler = expectChangeHandler(second);
        obs.arr.splice(0, 1);
        const [second2, third2] = obs.arr.map((a) => a);
        const [secondID2, thirdID2] = obs.arr.map((a) => a.id);

        expect(second).toBe(second2);
        expect(secondID).toBe(secondID2);
        expect(third).toBe(third2);
        expect(thirdID).toBe(thirdID2);
    });
    test('Array has stable swaps', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'h1' },
                { id: 'h2', text: 'h2' },
                { id: 'h3', text: 'h3' },
            ],
        });
        const second = obs.arr[1];
        const handler = expectChangeHandler(second);

        let arr = obs.arr.get();
        let tmp = arr[1];
        obs.arr.set(1, arr[2]);
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'h1' },
            { id: 'h3', text: 'h3' },
            { id: 'h3', text: 'h3' },
        ]);
        expect(tmp).toEqual({ id: 'h2', text: 'h2' });
        obs.arr.set(2, tmp);

        // Second becomes h3 still at index 1

        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'h1' },
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'h2' },
        ]);
        expect(handler).toBeCalledWith(
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'h2' },
            [],
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'h2' }
        );

        obs.arr[1].text.set('newtext');

        // debugger;
        expect(handler).toBeCalledWith(
            { id: 'h3', text: 'newtext' },
            { id: 'h3', text: 'h3' },
            ['text'],
            'newtext',
            'h3'
        );
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'h1' },
            { id: 'h3', text: 'newtext' },
            { id: 'h2', text: 'h2' },
        ]);
        expect(second.get()).toEqual({ id: 'h3', text: 'newtext' });
    });
    test('Array has stable swaps 2', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'hi' },
                { id: 'h2', text: 'hello' },
                { id: 'h3', text: 'h3' },
            ],
        });
        const second = obs.arr[1];
        const third = obs.arr[2];
        const handler = expectChangeHandler(second);
        const handler3 = expectChangeHandler(third);

        let arr = obs.arr.get();
        let tmp = arr[1];
        obs.arr.set(1, arr[2]);
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'hi' },
            { id: 'h3', text: 'h3' },
            { id: 'h3', text: 'h3' },
        ]);
        expect(tmp).toEqual({ id: 'h2', text: 'hello' });
        obs.arr.set(2, tmp);

        expect(second.get()).toEqual({ id: 'h3', text: 'h3' });
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'hi' },
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' },
        ]);
        expect(handler).toHaveBeenCalledWith(
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' },
            [],
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' }
        );
        expect(handler3).toHaveBeenCalledWith(
            { id: 'h2', text: 'hello' },
            { id: 'h3', text: 'h3' },
            [],
            { id: 'h2', text: 'hello' },
            { id: 'h3', text: 'h3' }
        );

        arr = obs.arr.get();
        tmp = arr[1];
        obs.arr.set(1, arr[2]);
        obs.arr.set(2, tmp);

        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'hi' },
            { id: 'h2', text: 'hello' },
            { id: 'h3', text: 'h3' },
        ]);

        expect(second.get()).toEqual({ id: 'h2', text: 'hello' });

        expect(handler).toHaveBeenCalledWith(
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' },
            [],
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' }
        );
        expect(handler3).toHaveBeenCalledWith(
            { id: 'h2', text: 'hello' },
            { id: 'h3', text: 'h3' },
            [],
            { id: 'h2', text: 'hello' },
            { id: 'h3', text: 'h3' }
        );

        obs.arr.splice(0, 1);

        expect(obs.arr[0].get()).toEqual({ id: 'h2', text: 'hello' });
        expect(second.get()).toEqual({ id: 'h2', text: 'hello' });

        obs.arr[0].text.set('hello there');

        expect(handler).toHaveBeenCalledWith(
            { id: 'h2', text: 'hello there' },
            { id: 'h2', text: 'hello' },
            ['text'],
            'hello there',
            'hello'
        );
    });
    test('Array set with just a swap optimized', () => {
        const obs = observable({
            test: [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
        });
        const handler = jest.fn();
        const handlerShallow = jest.fn();
        obs.test.onChange(handler);
        obs.test.onChange(handlerShallow, { optimized: true });
        const handlerItem = expectChangeHandler(obs.test[1]);

        const arr = obs.test.get().slice();
        const tmp = arr[1];
        arr[1] = arr[4];
        arr[4] = tmp;
        obs.test.set(arr);

        expect(obs.test.get()).toEqual([
            { id: 1, text: 1 },
            { id: 5, text: 5 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 2, text: 2 },
        ]);

        expect(handler).toHaveBeenCalled();
        expect(handlerItem).toHaveBeenCalledWith(
            { id: 5, text: 5 },
            { id: 2, text: 2 },
            [],
            { id: 5, text: 5 },
            { id: 2, text: 2 }
        );
        expect(handlerShallow).not.toHaveBeenCalled();
    });
});
describe('Deep changes keep listeners', () => {
    test('Deep set keeps listeners', () => {
        const obs = observable({ test: { test2: { test3: 'hello' } } });
        const handler = expectChangeHandler(obs.test.test2.test3);
        obs.set({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });
        expect(handler).toHaveBeenCalledWith('hi there', 'hello', [], 'hi there', 'hello');
    });
    test('Deep assign keeps listeners', () => {
        const obs = observable({ test: { test2: { test3: 'hello' } } });
        const handler = expectChangeHandler(obs.test.test2.test3);
        obs.assign({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });
        expect(handler).toHaveBeenCalledWith('hi there', 'hello', [], 'hi there', 'hello');
    });
    test('Deep set keeps keys', () => {
        const obs = observable({ test: { test2: { a1: 'ta' } as Record<string, any> } });
        obs.test.test2.a1.set({ text: 'ta1' });
        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        obs.test.test2.set('a2', { text: 'ta2' });
        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        obs.test.test2.set('a3', { text: 'ta3' });
        expect(obs).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
    });
    test('Set shallow of deep object keeps keys', () => {
        const obs = observable({ test: { test2: { a0: { text: 't0' } } as Record<string, any> } });
        obs.test.set({ test2: { a1: { text: 'ta1' } } });
        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        obs.test.set({ test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } });
        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        obs.test.test2.set('a3', { text: 'ta3' });
        expect(obs).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        obs.test.test2.set('a4', { text: 'ta4' });
        expect(obs).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' }, a4: { text: 'ta4' } } },
        });
        expect(obs.test.test2).toEqual({
            a1: { text: 'ta1' },
            a2: { text: 'ta2' },
            a3: { text: 'ta3' },
            a4: { text: 'ta4' },
        });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4']);
        obs.test.test2.assign({ a5: { text: 'ta5' } });
        expect(obs).toEqual({
            test: {
                test2: {
                    a1: { text: 'ta1' },
                    a2: { text: 'ta2' },
                    a3: { text: 'ta3' },
                    a4: { text: 'ta4' },
                    a5: { text: 'ta5' },
                },
            },
        });
        expect(obs.test.test2).toEqual({
            a1: { text: 'ta1' },
            a2: { text: 'ta2' },
            a3: { text: 'ta3' },
            a4: { text: 'ta4' },
            a5: { text: 'ta5' },
        });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
        obs.test.test2.set({ a6: { text: 'ta6' } });
        expect(obs).toEqual({
            test: {
                test2: {
                    a6: { text: 'ta6' },
                },
            },
        });
        expect(obs.test.test2).toEqual({
            a6: { text: 'ta6' },
        });
        expect(obs.test.test2.a1).toEqual(undefined);
        expect(Object.keys(obs.test.test2)).toEqual(['a6']);
        expect(Object.keys(obs.test.test2)).toEqual(['a6']);
    });
});
describe('Delete', () => {
    test('Delete key', () => {
        const obs = observable({ test: { text: 't', text2: 't2' } });
        obs.test.delete('text2');
        expect(obs).toEqual({ test: { text: 't' } });
    });
    test('Delete self', () => {
        const obs = observable({ test: { text: 't' }, test2: { text2: 't2' } });
        obs.test2.delete();
        expect(obs).toEqual({ test: { text: 't' } });
    });
    test('Delete property fires listeners', () => {
        const obs = observable({ obj: { val: true } });
        const handler = expectChangeHandler(obs.obj.val);
        obs.obj.delete('val');
        expect(handler).toHaveBeenCalledWith(undefined, true, [], undefined, true);
        expect(Object.keys(obs.obj)).toEqual([]);
    });
    test('Delete property fires listeners 2', () => {
        const obs = observable({ obj: { val: true } });
        const handler = expectChangeHandler(obs.obj.val);
        obs.obj.delete();
        expect(handler).toHaveBeenCalledWith(undefined, true, [], undefined, true);
        expect(Object.keys(obs)).toEqual([]);
    });
    test('Delete fires listeners of children', () => {
        const obs = observable({ obj: { num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } } });
        const handler = expectChangeHandler(obs.obj.num1);
        obs.delete('obj');
        expect(handler).toHaveBeenCalledWith(undefined, 1, [], undefined, 1);
    });
    test('Accessing a deleted node', () => {
        const obs = observable({ obj: { text: 'hi' } });
        const obj = obs.obj;
        obs.delete('obj');
        expect(() => {
            obj.set('text', 'hello');
        }).toThrow();
        expect(obs).toEqual({});
    });
    test('Delete key', () => {
        const obs = observable({ test: { text: 't', text2: 't2' } });
        obs.test.delete('text2');
        expect(Object.keys(obs.test)).toEqual(['text']);
    });
});
describe('on functions', () => {
    test('onChange immediate', () => {
        const obs = observable({ val: 10 });
        const handler = expectChangeHandler(obs.val, { runImmediately: true });
        expect(handler).toHaveBeenCalledWith(10, 10, [], 10, 10);
    });
    test('when equals', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        when(() => obs.val === 20, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(20);
        expect(handler).toHaveBeenCalled();
    });
    test('when equals immediate', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        when(() => obs.val === 10, handler);
        expect(handler).toHaveBeenCalled();
    });
    test('when equals deep', () => {
        const obs = observable({ test: { test2: '', test3: '' } });
        const handler = jest.fn();
        when(() => obs.test.test2 === 'hello', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hi');
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hello');
        expect(handler).toHaveBeenCalled();
    });
    test('when true', () => {
        const obs = observable({ val: false });
        const handler = jest.fn();
        when(() => obs.val, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalled();
    });
    test('when true starting true', () => {
        const obs = observable({ val: true });
        const handler = jest.fn();
        when(() => obs.val, handler);
        expect(handler).toHaveBeenCalled();
        obs.val.set(false);
        expect(handler).toHaveBeenCalledTimes(1);
        obs.val.set(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
});
describe('Shallow', () => {
    test('Shallow set primitive', () => {
        const obs = observable({ val: false } as { val: boolean; val2?: number });
        const handler = jest.fn();
        obs.onChange(handler, { shallow: true });
        obs.val.set(true);
        expect(handler).not.toHaveBeenCalled();
        obs.obs('val2').set(10);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Shallow deep object', () => {
        const obs = observable({ val: { val2: { val3: 'hi' } } });
        const handler = jest.fn();
        obs.onChange(handler, { shallow: true });
        obs.val.val2.val3.set('hello');
        expect(handler).not.toHaveBeenCalled();
    });
    test('Shallow array', () => {
        const obs = observable({ data: [], selected: 0 });
        const handler = jest.fn();
        obs.data.onChange(handler, { shallow: true });
        obs.data.set([{ text: 1 }, { text: 2 }]);
        expect(handler).toHaveBeenCalledTimes(1);
        // Setting an index in an array should not notify the array
        obs.data.set(0, { text: 11 });
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Key delete notifies shallow', () => {
        const obs = observable({ test: { key1: { text: 'hello' }, key2: { text: 'hello2' } } });
        const handler = jest.fn();
        obs.test.onChange(handler, { shallow: true });

        obs.test.delete('key2');

        expect(handler).toHaveBeenCalledTimes(1);

        // But setting to undefined does not
        obs.test.set('key1', undefined);

        expect(handler).toHaveBeenCalledTimes(1);

        obs.test.set('key3', { text: 'hello3' });

        expect(handler).toHaveBeenCalledTimes(2);
    });
    test('Array splice notifies shallow', () => {
        const obs = observable({ arr: [{ text: 'hello' }, { text: 'hello2' }] });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.arr.onChange(handler, { shallow: true });
        obs.arr.onChange(handler2);

        obs.arr.splice(1, 1);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);

        obs.arr.push({ text: 'hello3' });

        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler2).toHaveBeenCalledTimes(2);
    });
});
describe('Computed', () => {
    test('Basic computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test + obs.test2);
        expect(comp.value).toEqual(30);
    });
    test('Multiple computed changes', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test + obs.test2);
        expect(comp.value).toEqual(30);
        const handler = expectChangeHandler(comp);
        obs.test.set(5);
        expect(handler).toHaveBeenCalledWith(25, 30, [], 25, 30);
        expect(comp.value).toEqual(25);
        obs.test.set(1);
        expect(handler).toHaveBeenCalledWith(21, 25, [], 21, 25);
        expect(comp.value).toEqual(21);
    });
    test('Cannot directly set a computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test + obs.test2);
        // @ts-expect-error
        comp.set(40);
        // @ts-expect-error
        comp.assign({ text: 'hi' });
        // @ts-expect-error
        comp.delete();
    });
    test('Computed object is observable', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => ({ value: obs.test + obs.test2 }));
        expect(comp.value).toEqual(30);

        const handler = expectChangeHandler(comp.value);
        obs.test = 5;

        expect(handler).toHaveBeenCalledWith(25, 30, [], 25, 30);
    });
});
describe('Event', () => {
    test('Event', () => {
        const evt = event();
        const handler = jest.fn();
        evt.on(handler);
        expect(handler).not.toHaveBeenCalled();
        evt.dispatch();
        expect(handler).toHaveBeenCalledTimes(1);
        evt.dispatch();
        evt.dispatch();
        evt.dispatch();
        expect(handler).toHaveBeenCalledTimes(4);
    });
});
describe('Promise values', () => {
    test('Promise value', async () => {
        const promise = Promise.resolve(10);
        const obs = observable({ promise });
        expect(obs.promise).resolves.toEqual(10);
    });
});
describe('Batching', () => {
    test('Assign is batched', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = jest.fn();
        obs.num1.onChange(handler);
        obs.num2.onChange(handler);
        obs.num3.onChange(handler);
        obs.assign({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Setting only calls once', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = jest.fn();
        obs.num1.onChange(handler);
        obs.num2.onChange(handler);
        obs.num3.onChange(handler);
        obs.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Batching is batched', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = jest.fn();
        obs.num1.onChange(handler);
        obs.num2.onChange(handler);
        obs.num3.onChange(handler);
        beginBatch();
        beginBatch();
        beginBatch();
        obs.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        endBatch();
        endBatch();
        endBatch();
        expect(handler).toHaveBeenCalledTimes(1);
    });
});
describe('obs function', () => {
    test('With and without obs', () => {
        const obs = observable({ text: 'hi' });
        const prox = obs.obs('text');
        const prox2 = obs.text.obs();
        expect(prox === prox2).toEqual(true);
        expect(prox2.get()).toEqual('hi');
    });
    test('keyed obs', () => {
        const obs = observable({ text: 'hi' });
        const prox = obs.obs('text');
        const prox2 = obs.obs('text');
        expect(prox === prox2).toEqual(true);
        expect(prox2.get()).toEqual('hi');
    });
    test('obs through undefined works', () => {
        const obs = observable({ test: undefined } as { test: { test2: { test3: { test4: string } } } });
        const obsTest4 = obs.obs('test').obs('test2').obs('test3').obs('test4');
        const handler = expectChangeHandler(obsTest4);
        obs.set({ test: { test2: { test3: { test4: 'hi' } } } });
        expect(handler).toHaveBeenCalledWith('hi', undefined, [], 'hi', undefined);
    });
    test('obs through undefined with get()', () => {
        const obs = observable({ test: undefined } as { test: { test2: { test3: { test4: string } } } });
        const obsTest4 = obs.obs('test').obs('test2').obs('test3').obs('test4');
        expect(obsTest4.get()).toEqual(undefined);
    });
});
describe('effect', () => {
    test('Basic effect', () => {
        const obs = observable({ text: 'hi' });
        const fn = jest.fn();
        effect(() => {
            fn(obs.text);
        });
        obs.text.set('hello');
        expect(fn).toHaveBeenCalledWith('hello');
        obs.text.set('a');
        expect(fn).toHaveBeenCalledWith('a');
    });
});
describe('Observable with promise', () => {
    test('Promise', async () => {
        let resolver;
        const promise = new Promise<number>((resolve) => {
            resolver = resolve;
        });
        const obs = observable(promise);

        expect(obs.value).toEqual(undefined);

        resolver(10);

        await promiseTimeout(0);

        expect(obs.value).toEqual(10);
    });
    test('when with promise observable', async () => {
        let resolver;
        const promise = new Promise<number>((resolve) => {
            resolver = resolve;
        });
        const obs = observable(promise);

        expect(obs.value).toEqual(undefined);

        const fn = jest.fn();
        when(() => obs.get() === 10, fn);

        resolver(10);

        await promiseTimeout(1000);

        expect(fn).toHaveBeenCalled();
    });
});
describe('Locking', () => {
    const obs = observable({ text: 'hi' });
    lockEdits(obs, true);
    expect(() => obs.text.set('hello')).toThrowError();
    expect(() => (obs.text = 'hello')).toThrowError();
    expect(() => obs.set({ text: 'hello' })).toThrowError();
    expect(obs.get()).toEqual({ text: 'hi' });
    lockEdits(obs, false);
    obs.text.set('hey');
    expect(obs.get()).toEqual({ text: 'hey' });
});
