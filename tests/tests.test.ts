import { observableComputed } from '../src/observableComputed';
import { observable } from '../src/observable';
import { observableEvent } from '../src/observableEvent';
import { observableBatcher } from '../src/observableBatcher';

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

describe('Set', () => {
    test('Set', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.set({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set primitive', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.text.set('t2');
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set prop', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.setProp('text', 't2');
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set child', () => {
        const obs = observable({ test: { text: { text2: 't' } } });
        obs.test.text.set({ text2: 't2' });
        expect(obs).toEqual({ test: { text: { text2: 't2' } } });
    });
    test('Set array', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        obs.arr.set([{ text: 'hi2' }]);
        expect(obs.arr.length).toEqual(1);

        const arr = obs.arr;

        expect(obs.arr.get()).toEqual([{ text: 'hi2' }]);
        expect(obs.arr[0].text).toEqual('hi2');
        obs.arr[0].text.set('hi3');
        expect(obs.arr.map((a) => a)).toEqual([{ text: 'hi3' }]);
    });
    // TODO
    // test('Set at root', () => {
    //     const obs = observable({ test: { text: 't' } });
    //     obs.set({ test: { text: 't2' } });
    //     expect(obs).toEqual({ test: { text: 't2' } });
    // });
    test('Set value does not copy object', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toBe(newVal);
    });
    test('Multiple sets does not cleanup existing nodes', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        const handler = jest.fn();
        obs.arr.onChange(handler);

        obs.arr.set([{ text: 'hi2' }]);

        const setVal = obs.arr.set([{ text: 'hello' }]);
        expect(setVal).toEqual([{ text: 'hello' }]);

        expect(obs.arr.get()).toEqual([{ text: 'hello' }]);

        expect(handler).toHaveBeenCalledWith([{ text: 'hello' }], {
            path: [],
            prevValue: [{ text: 'hi2' }],
            value: [{ text: 'hello' }],
        });
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
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test.onChange(handler);
        obs.onChange(handler2);
        obs.test.set({ text: 't2' });
        expect(handler).toHaveBeenCalledWith(
            { text: 't2' },
            { value: { text: 't2' }, path: [], prevValue: { text: 't' } }
        );
        expect(handler2).toHaveBeenCalledWith(
            { test: { text: 't2' }, arr: [] },
            { value: { text: 't2' }, path: ['test'], prevValue: { text: 't' } }
        );
    });
    test('Listen by prop', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        // TODO
        obs.test.prop('text').onChange(handler);
        obs.test.setProp('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
    });
    test('Listen by key', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        obs.test.text.onChange(handler);
        obs.test.setProp('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
    });
    test('Listen deep', () => {
        const obs = observable({ test: { test2: { test3: { text: 't' } } } });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test.test2.test3.text.onChange(handler);
        obs.onChange(handler2);
        obs.test.test2.test3.text.set('t2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
        expect(handler2).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't', value: 't2' }
        );
    });
    test('Listen calls multiple times', () => {
        const obs = observable({ test: { test2: { test3: { text: 't' } } } });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.test.test2.test3.text.set('t2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't', value: 't2' }
        );
        obs.test.test2.test3.text.set('t3');
        expect(obs.test.test2.test3.text).toEqual('t3');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't3' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't2', value: 't3' }
        );
    });
    test('Set calls and maintains deep listeners', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const handler = jest.fn();
        obs.test.test2.onChange(handler);
        obs.test.set({ test2: 'hello' });
        expect(handler).toHaveBeenCalledWith('hello', { path: [], prevValue: 'hi', value: 'hello' });
        obs.test.set({ test2: 'hi there' });
        expect(obs.test.test2).toEqual('hi there');
        expect(handler).toHaveBeenCalledWith('hi there', { path: [], prevValue: 'hello', value: 'hi there' });
    });
    test('Set on root calls deep listeners', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const handler = jest.fn();
        obs.test.test2.onChange(handler);
        obs.set({ test: { test2: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', { path: [], prevValue: 'hi', value: 'hello' });
    });
    test('Shallow listener', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test.onChangeShallow(handler);
        obs.onChangeShallow(handler2);
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
        const handler = jest.fn();
        obs.test.onChange(handler);
        expect(handler).not.toHaveBeenCalled();
        obs.test.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { value: { val: 20 }, path: [], prevValue: { val: 10 } });
        obs.test.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { value: { val: 21 }, path: [], prevValue: { val: 20 } });
        obs.test.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { value: { val: 22 }, path: [], prevValue: { val: 21 } });
        obs.test.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { value: { val: 23 }, path: [], prevValue: { val: 22 } });
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener called for each change at root', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        obs.onChange(handler);
        expect(handler).not.toHaveBeenCalled();
        obs.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { value: 20, path: ['val'], prevValue: 10 });
        obs.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { value: 21, path: ['val'], prevValue: 20 });
        obs.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { value: 22, path: ['val'], prevValue: 21 });
        obs.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { value: 23, path: ['val'], prevValue: 22 });
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener with key fires only for key', () => {
        const obs = observable({ val: { val2: 10 }, val3: 'hello' });
        const handler = jest.fn();
        obs.val.onChange(handler);
        obs.val.val2.set(20);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { value: 20, path: ['val2'], prevValue: 10 });
        obs.val3.set('hihi');
        obs.val3.set('hello again');
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Object listener', () => {
        const obs = observable({ test: 'hi' });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.test.set('hello');
        expect(handler).toHaveBeenCalledWith({ test: 'hello' }, { value: 'hello', path: ['test'], prevValue: 'hi' });
    });
    test('Deep object listener', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.test.test2.test3.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { value: 'hello', path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set primitive undefined', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.test.test2.test3.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: undefined } } },
            { value: undefined, path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set undefined', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.test.test2.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: undefined } },
            { value: undefined, path: ['test', 'test2'], prevValue: { test3: 'hi' } }
        );
    });
    test('Start null set to something', () => {
        const obs = observable({ test: null });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.setProp('test', { test2: 'hi' });
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi' } },
            {
                value: { test2: 'hi' },
                path: ['test'],
                prevValue: null,
            }
        );
    });
    test('Start undefined set to something', () => {
        const obs = observable({ test: undefined });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.setProp('test', { test2: 'hi' });
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi' } },
            {
                value: { test2: 'hi' },
                path: ['test'],
                prevValue: undefined,
            }
        );
    });
    test('Set with object should only fire listeners once', () => {
        const obs = observable({ test: undefined });
        const handler = jest.fn();
        obs.onChange(handler);
        obs.setProp('test', { test2: 'hi', test3: 'hi3', test4: 'hi4' });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi', test3: 'hi3', test4: 'hi4' } },
            {
                value: { test2: 'hi', test3: 'hi3', test4: 'hi4' },
                path: ['test'],
                prevValue: undefined,
            }
        );
    });
    test('Listener promises', async () => {
        const obs = observable({ test: 'hi' });
        const promise = obs.test.onEquals('hi2').promise;
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
        const handlerRoot = jest.fn();
        obs.onChange(handlerRoot);
        const handler1 = jest.fn();
        obs.test1.onChange(handler1);
        const handler2 = jest.fn();
        obs.test1.test2.onChange(handler2);
        const handler3 = jest.fn();
        obs.test1.test2.test3.onChange(handler3);
        const handler4 = jest.fn();
        obs.test1.test2.test3.test4.onChange(handler4);
        obs.test1.test2.test3.test4.set('hi');
        expect(handlerRoot).toHaveBeenCalledWith(
            { test1: { test2: { test3: { test4: 'hi' } } } },
            { value: 'hi', path: ['test1', 'test2', 'test3', 'test4'], prevValue: '' }
        );
        expect(handler1).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi' } } },
            { value: 'hi', path: ['test2', 'test3', 'test4'], prevValue: '' }
        );
        expect(handler2).toHaveBeenCalledWith(
            { test3: { test4: 'hi' } },
            { value: 'hi', path: ['test3', 'test4'], prevValue: '' }
        );
        expect(handler3).toHaveBeenCalledWith({ test4: 'hi' }, { value: 'hi', path: ['test4'], prevValue: '' });
        expect(handler4).toHaveBeenCalledWith('hi', {
            value: 'hi',
            path: [],
            prevValue: '',
        });
    });
    test('Set with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = jest.fn();
        obs.obj.test.onChange(handler);
        obs.set({ obj: { test: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', {
            value: 'hello',
            path: [],
            prevValue: 'hi',
        });
    });
    test('Set undefined deep with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = jest.fn();
        obs.obj.test.onChange(handler);
        obs.obj.setProp('test', undefined);
        expect(handler).toHaveBeenCalledWith(undefined, {
            value: undefined,
            path: [],
            prevValue: 'hi',
        });
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
        expect(ret2).toEqual('hello');
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
        const handler = jest.fn();
        obs.test.onChange(handler);
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test.test2.test3).toEqual(undefined);
        obs.test.test2.setProp('test3', { test4: 'hi4', test5: 'hi5' });
        expect(obs.test.test2.test3).toEqual({ test4: 'hi4', test5: 'hi5' });
        expect(obs.test.test2).toEqual({ test3: { test4: 'hi4', test5: 'hi5' } });
        expect(obs.test).toEqual({ test2: { test3: { test4: 'hi4', test5: 'hi5' } } });
        expect(obs).toEqual({ test: { test2: { test3: { test4: 'hi4', test5: 'hi5' } } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi4', test5: 'hi5' } } },
            {
                value: { test4: 'hi4', test5: 'hi5' },
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
        );
        obs.test.test2.setProp('test3', undefined);
        expect(obs.test.test2.test3).toEqual(undefined);
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs).toEqual({ test: { test2: { test3: undefined } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: undefined } },
            {
                value: undefined,
                path: ['test2', 'test3'],
                prevValue: { test4: 'hi4', test5: 'hi5' },
            }
        );
        obs.test.test2.setProp('test3', { test4: 'hi6', test5: 'hi7' });
        expect(obs.test.test2.test3).toEqual({ test4: 'hi6', test5: 'hi7' });
        expect(obs.test.test2).toEqual({ test3: { test4: 'hi6', test5: 'hi7' } });
        expect(obs.test).toEqual({ test2: { test3: { test4: 'hi6', test5: 'hi7' } } });
        expect(obs).toEqual({ test: { test2: { test3: { test4: 'hi6', test5: 'hi7' } } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi6', test5: 'hi7' } } },
            {
                value: { test4: 'hi6', test5: 'hi7' },
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
        );
    });
    test('Set deep primitive undefined to value and back', () => {
        const obs = observable({ test: { test2: { test3: undefined } } });
        const handler = jest.fn();
        obs.test.onChange(handler);
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test.test2.test3).toEqual(undefined);
        obs.test.test2.setProp('test3', 'hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2).toEqual({ test3: 'hi' });
        expect(obs.test).toEqual({ test2: { test3: 'hi' } });
        expect(obs).toEqual({ test: { test2: { test3: 'hi' } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi' } },
            {
                value: 'hi',
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
        );
        obs.test.test2.setProp('test3', undefined);
        expect(obs.test.test2.test3).toEqual(undefined);
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs).toEqual({ test: { test2: { test3: undefined } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: undefined } },
            {
                value: undefined,
                path: ['test2', 'test3'],
                prevValue: 'hi',
            }
        );
        obs.test.test2.setProp('test3', 'hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2).toEqual({ test3: 'hi' });
        expect(obs.test.test2).toEqual({ test3: 'hi' });
        expect(obs.test).toEqual({ test2: { test3: 'hi' } });
        expect(obs).toEqual({ test: { test2: { test3: 'hi' } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi' } },
            {
                value: 'hi',
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
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
            {
                value: { test3: 'hi2' },
                path: ['test2'],
                prevValue: { test3: 'hi' },
            }
        );
    });
    test('Set number key', () => {
        const obs = observable({ test: {} as Record<number, string> });
        const handler = jest.fn();
        obs.test.onChange(handler);
        obs.test.setProp(1, 'hi');
        expect(handler).toHaveBeenCalledWith(
            { '1': 'hi' },
            {
                value: 'hi',
                path: [1],
                prevValue: undefined,
            }
        );
    });
    test('Set number key multiple times', () => {
        const obs = observable({ test: { t: {} as Record<number, any> } });
        const handler = jest.fn();
        obs.test.onChange(handler);
        obs.test.t.setProp(1000, { test1: { text: ['hi'] } });
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
            {
                value: { test1: { text: ['hi'] } },
                path: ['t', 1000],
                prevValue: undefined,
            }
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
            {
                value: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
                path: ['t', 1000],
                prevValue: { test1: { text: ['hi'] } },
            }
        );
        obs.test.t.setProp(1000, { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } });
        expect(obs.test.t.get()).toEqual({
            1000: {
                test1: { text: ['hiz'], text2: 'hiz2' },
                test2: { text: ['hi2'] },
            },
        });
        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } } } },
            {
                value: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } },
                path: ['t', 1000],
                prevValue: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
            }
        );
    });
    test('Set does not fire if unchanged', () => {
        const obs = observable({ test: { test1: 'hi' } });
        const handler = jest.fn();
        obs.test.onChange(handler);
        obs.test.setProp('test1', 'hi');
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
        const obs = observable({ arr: [{ text: 'hi' }] });
        const handler = jest.fn();
        obs.arr.onChange(handler);
        const arr = obs.arr.get();
        obs.arr.set(obs.arr);
        expect(obs.arr.get()).toBe(arr);
        expect(handler).toHaveBeenCalledWith(arr, { path: [], prevValue: [{ text: 'hi' }], value: [{ text: 'hi' }] });
    });
    test('Set with array with new items still notifies', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        const handler = jest.fn();
        obs.arr.onChange(handler);
        const arr = obs.arr.get();
        arr[1] = {
            text: 'hi2',
        };
        obs.arr.set(obs.arr);
        expect(obs.arr.get()).toBe(arr);
        expect(handler).toHaveBeenCalledWith(arr, {
            path: [],
            prevValue: [{ text: 'hi' }, { text: 'hi2' }],
            value: [{ text: 'hi' }, { text: 'hi2' }],
        });
    });
});
describe('Safety', () => {
    test('Prevent writes', () => {
        const obs = observable({ test: { text: 't' } });
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
    });
    test('observable root can be primitive', () => {
        const obs = observable(10);
        expect(obs.current).toEqual(10);

        obs.set(20);

        expect(obs.current).toEqual(20);
    });
});
describe('Array', () => {
    test('Basic array', () => {
        const obs = observable({ arr: [] });
        expect(obs.arr.get()).toEqual([]);
        obs.arr.set([1, 2, 3]);
        expect(obs.arr.get()).toEqual([1, 2, 3]);
    });
    test('Array functions', () => {
        const obs = observable({ arr: [] });
        const handler = jest.fn();
        obs.arr.onChange(handler);
    });
    test('Array still has builtin functions', () => {
        const obs = observable({ arr: [1, 2] });
        expect(obs.arr.map((a) => a)).toEqual([1, 2]);
    });
    //     test('Array push', () => {
    //         const obs = observable({ test: ['hi'] });
    //         const handler = jest.fn();
    //         obs.onChange(handler);
    //         obs.test.push('hello');
    //         expect(obs.test).toEqual(['hi', 'hello']);
    //         expect(handler).toHaveBeenCalledWith(
    //             { test: ['hi', 'hello'] },
    //             { value: ['hi', 'hello'], path: ['test'], prevValue: ['hi'] }
    //         );
    //         expect(handler).toHaveBeenCalledTimes(1);
    //     });
    //     test('Array splice', () => {
    //         const obs = observable({ test: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }] });
    //         const handler = jest.fn();
    //         obs.onChange(handler);
    //         const last = obs.test[2];
    //         obs.test.splice(1, 1);
    //         expect(obs.test).toEqual([{ text: 'hi' }, { text: 'there' }]);
    //         expect(obs.test[1]).toBe(last);
    //         expect(handler).toHaveBeenCalledWith(
    //             { test: [{ text: 'hi' }, { text: 'there' }] },
    //             {
    //                 value: [{ text: 'hi' }, { text: 'there' }],
    //                 path: ['test'],
    //                 prevValue: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }],
    //             }
    //         );
    //         expect(handler).toHaveBeenCalledTimes(1);
    //     });
    // //     test('Array swap', () => {
    // //         const obs = observable({ test: [1, 2, 3, 4, 5] });
    // //         let tmp = obs.test[1];
    // //         obs.test.set(1, obs.test[4]);
    // //         obs.test.set(4, tmp);
    // //         expect(obs.test).toEqual([1, 5, 3, 4, 2]);
    // //         tmp = obs.test[1];
    // //         obs.test.set(1, obs.test[4]);
    // //         obs.test.set(4, tmp);
    // //         expect(obs.test).toEqual([1, 2, 3, 4, 5]);
    // //     });
    // //     test('Array set', () => {
    // //         const obs = observable({ test: [] });
    // //         const arr = [];
    // //         for (let i = 0; i < 1000; i++) {
    // //             arr[i] = { id: i };
    // //         }
    // //         obs.test.set(arr);
    // //         expect(obs.test.length).toEqual(1000);
    // //         expect(obs.test[3].id).toEqual(3);
    // //     });
    // //     test('Array swap with objects', () => {
    // //         const obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
    // //         let arr = obs.test;
    // //         let tmp = arr[1];
    // //         obs.test.set(1, arr[4]);
    // //         obs.test.set(4, tmp);
    // //         expect(obs.test).toEqual([{ text: 1 }, { text: 5 }, { text: 3 }, { text: 4 }, { text: 2 }]);
    // //         expect(obs.test[1]).toEqual({ text: 5 });
    // //         expect(arr[1]).toEqual({ text: 5 });
    // //         expect(obs.test[4]).toEqual({ text: 2 });
    // //         expect(arr[4]).toEqual({ text: 2 });
    // //         tmp = arr[1];
    // //         obs.test.set(1, arr[4]);
    // //         obs.test.set(4, tmp);
    // //         expect(obs.test).toEqual([{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
    // //     });
    // //     test('Array swap if empty', () => {
    // //         const obs = observable({ test: [] });
    // //         let tmp = obs.test[1];
    // //         obs.test.set(1, obs.test[4]);
    // //         expect(obs.test).toEqual([undefined, undefined]);
    // //         obs.test.set(4, tmp);
    // //         expect(obs.test).toEqual([undefined, undefined, undefined, undefined, undefined]);
    // //     });
    // //     test('Clear array fires listener once', () => {
    // //         let obs = observable({ arr: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
    // //         const handler = jest.fn();
    // //         obs.arr.onChange(handler);
    // //         obs.set('arr', []);
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // //     test('Array clear if listening', () => {
    // //         let obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
    // //         obs.test[0].onChange(() => {});
    // //         obs.test[1].onChange(() => {});
    // //         obs.test[2].onChange(() => {});
    // //         obs.test[3].onChange(() => {});
    // //         obs.test[4].onChange(() => {});
    // //         obs.test.set([]);
    // //         expect(obs.test).toEqual([]);
    // //         expect(obs.test).toEqual([]);
    // //         expect(obs.test.length).toEqual(0);
    // //         expect(obs.test.length).toEqual(0);
    // //         expect(obs.test.map((a) => a)).toEqual([]);
    // //     });
    // //     test('Array splice fire events', () => {
    // //         let obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
    // //         const handler = jest.fn();
    // //         obs.test.onChange(handler);
    // //         obs.test[0].onChange(() => {});
    // //         obs.test[1].onChange(() => {});
    // //         obs.test[2].onChange(() => {});
    // //         obs.test[3].onChange(() => {});
    // //         obs.test[4].onChange(() => {});
    // //         obs.test.splice(0, 1);
    // //         expect(obs.test[0]).toEqual({ text: 2 });
    // //         expect(obs.test[0]).toEqual({ text: 2 });
    // //         expect(obs.test).toEqual([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
    // //         expect(obs.test).toEqual([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
    // //         expect(obs.test.length).toEqual(4);
    // //         expect(obs.test.length).toEqual(4);
    // //         expect(obs.test.map((a) => a)).toEqual([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
    // //         // TODO
    // //         // expect(handler).toHaveBeenCalledTimes(1);
    // //         expect(handler).toHaveBeenCalledWith([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }], {
    // //             value: [{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }],
    // //             path: [],
    // //             prevValue: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }],
    // //         });
    // //     });
    // //     test('Array with listeners clear', () => {
    // //         let obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
    // //         const handler = jest.fn();
    // //         obs.test.onChangeShallow(handler);
    // //         obs.test[0].onChange(() => {});
    // //         obs.test[1].onChange(() => {});
    // //         obs.test[2].onChange(() => {});
    // //         obs.test[3].onChange(() => {});
    // //         obs.test[4].onChange(() => {});
    // //         obs.test.set([]);
    // //     });
    // //     test('Array set by index', () => {
    // //         const obs = observable({ test: [{ text: 'hi' }] });
    // //         obs.test[0].set({ text: 'hi2' });
    // //         expect(obs.test[0]).toEqual({ text: 'hi2' });
    // //     });
    // // });
    // // describe('Deep changes keep listeners', () => {
    // //     test('Deep set keeps listeners', () => {
    // //         const obs = observable({ test: { test2: { test3: 'hello' } } });
    // //         const handler = jest.fn();
    // //         obs.test.test2.onChange('test3', handler);
    // //         obs.set({
    // //             test: {
    // //                 test2: {
    // //                     test3: 'hi there',
    // //                 },
    // //             },
    // //         });
    // //         expect(handler).toHaveBeenCalledWith('hi there', {
    // //             value: 'hi there',
    // //             path: [],
    // //             prevValue: 'hello',
    // //         });
    // //     });
    // //     test('Deep assign keeps listeners', () => {
    // //         const obs = observable({ test: { test2: { test3: 'hello' } } });
    // //         const handler = jest.fn();
    // //         obs.test.test2.onChange('test3', handler);
    // //         obs.assign({
    // //             test: {
    // //                 test2: {
    // //                     test3: 'hi there',
    // //                 },
    // //             },
    // //         });
    // //         expect(handler).toHaveBeenCalledWith('hi there', {
    // //             value: 'hi there',
    // //             path: [],
    // //             prevValue: 'hello',
    // //         });
    // //     });
    // //     test('Deep set keeps keys', () => {
    // //         const obs = observable({ test: { test2: {} as Record<string, any> } });
    // //         obs.test.test2.set('a1', { text: 'ta1' });
    // //         expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
    // //         expect(obs.test.test2).toEqual({ a1: { text: 'ta1' } });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1']);
    // //         obs.test.test2.set('a2', { text: 'ta2' });
    // //         expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
    // //         expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
    // //         obs.test.test2.set('a3', { text: 'ta3' });
    // //         expect(obs).toEqual({
    // //             test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
    // //         });
    // //         expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
    // //     });
    // //     test('Set shallow of deep object keeps keys', () => {
    // //         const obs = observable({ test: { test2: { a0: { text: 't0' } } as Record<string, any> } });
    // //         obs.test.set({ test2: { a1: { text: 'ta1' } } });
    // //         expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
    // //         expect(obs.test.test2).toEqual({ a1: { text: 'ta1' } });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1']);
    // //         obs.test.set({ test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } });
    // //         expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
    // //         expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
    // //         obs.test.test2.set('a3', { text: 'ta3' });
    // //         expect(obs).toEqual({
    // //             test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
    // //         });
    // //         expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
    // //         obs.test.test2.set('a4', { text: 'ta4' });
    // //         expect(obs).toEqual({
    // //             test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' }, a4: { text: 'ta4' } } },
    // //         });
    // //         expect(obs.test.test2).toEqual({
    // //             a1: { text: 'ta1' },
    // //             a2: { text: 'ta2' },
    // //             a3: { text: 'ta3' },
    // //             a4: { text: 'ta4' },
    // //         });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4']);
    // //         obs.test.test2.assign({ a5: { text: 'ta5' } });
    // //         expect(obs).toEqual({
    // //             test: {
    // //                 test2: {
    // //                     a1: { text: 'ta1' },
    // //                     a2: { text: 'ta2' },
    // //                     a3: { text: 'ta3' },
    // //                     a4: { text: 'ta4' },
    // //                     a5: { text: 'ta5' },
    // //                 },
    // //             },
    // //         });
    // //         expect(obs.test.test2).toEqual({
    // //             a1: { text: 'ta1' },
    // //             a2: { text: 'ta2' },
    // //             a3: { text: 'ta3' },
    // //             a4: { text: 'ta4' },
    // //             a5: { text: 'ta5' },
    // //         });
    // //         expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
    // //         obs.test.test2.set({ a6: { text: 'ta6' } });
    // //         expect(obs).toEqual({
    // //             test: {
    // //                 test2: {
    // //                     a6: { text: 'ta6' },
    // //                 },
    // //             },
    // //         });
    // //         expect(obs.test.test2).toEqual({
    // //             a6: { text: 'ta6' },
    // //         });
    // //         expect(obs.test.test2.a1).toEqual(undefined);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a6']);
    // //         expect(Object.keys(obs.test.test2)).toEqual(['a6']);
    // //     });
    // // });
    // // describe('Delete', () => {
    // //     test('Delete key', () => {
    // //         const obs = observable({ test: { text: 't', text2: 't2' } });
    // //         obs.test.delete('text2');
    // //         expect(obs).toEqual({ test: { text: 't' } });
    // //     });
    // //     test('Delete self', () => {
    // //         const obs = observable({ test: { text: 't' }, test2: { text2: 't2' } });
    // //         obs.test2.delete();
    // //         expect(obs).toEqual({ test: { text: 't' } });
    // //     });
    // //     test('Delete property fires listeners', () => {
    // //         const obs = observable({ obj: { val: true } });
    // //         const handler = jest.fn();
    // //         obs.obj.onChange('val', handler);
    // //         obs.obj.delete('val');
    // //         expect(handler).toHaveBeenCalledWith(undefined, {
    // //             value: undefined,
    // //             path: [],
    // //             prevValue: true,
    // //         });
    // //         expect(Object.keys(obs.obj)).toEqual([]);
    // //     });
    // //     test('Delete does not fire listeners of children', () => {
    // //         const obs = observable({ obj: { num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } } });
    // //         const handler = jest.fn();
    // //         obs.obj.onChange('num1', handler);
    // //         obs.delete('obj');
    // //         expect(handler).not.toHaveBeenCalled();
    // //     });
    // //     test('Accessing a deleted node', () => {
    // //         const obs = observable({ obj: { text: 'hi' } });
    // //         const obj = obs.obj;
    // //         obs.delete('obj');
    // //         obj.set('text', 'hello');
    // //         expect(console.error).toHaveBeenCalledTimes(1);
    // //         expect(obs).toEqual({});
    // //     });
    // // });
    // // describe('on functions', () => {
    // //     test('onValue with prop', () => {
    // //         const obs = observable({ val: 10 });
    // //         const handler = jest.fn();
    // //         obs.prop('val').onEquals(20, handler);
    // //         expect(handler).not.toHaveBeenCalled();
    // //         obs.set('val', 20);
    // //         expect(handler).toHaveBeenCalledWith(20);
    // //     });
    // //     test('onValue deep', () => {
    // //         const obs = observable({ test: { test2: '', test3: '' } });
    // //         const handler = jest.fn();
    // //         obs.test.onEquals('test2', 'hello', handler);
    // //         expect(handler).not.toHaveBeenCalled();
    // //         obs.test.set('test2', 'hi');
    // //         expect(handler).not.toHaveBeenCalled();
    // //         obs.test.set('test2', 'hello');
    // //         expect(handler).toHaveBeenCalledWith('hello');
    // //     });
    // //     test('onTrue', () => {
    // //         const obs = observable({ val: false });
    // //         const handler = jest.fn();
    // //         obs.onTrue('val', handler);
    // //         expect(handler).not.toHaveBeenCalled();
    // //         obs.set('val', true);
    // //         expect(handler).toHaveBeenCalledWith(true);
    // //     });
    // //     test('onTrue starting true', () => {
    // //         const obs = observable({ val: true });
    // //         const handler = jest.fn();
    // //         obs.onTrue('val', handler);
    // //         expect(handler).toHaveBeenCalled();
    // //         obs.set('val', false);
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //         obs.set('val', true);
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // //     test('onHasValue with false', () => {
    // //         const obs = observable({ val: false });
    // //         const handler = jest.fn();
    // //         obs.onHasValue('val', handler);
    // //         expect(handler).toHaveBeenCalled();
    // //         obs.set('val', true);
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // //     test('onHasValue with undefined', () => {
    // //         const obs = observable({ val: undefined });
    // //         const handler = jest.fn();
    // //         obs.onHasValue('val', handler);
    // //         expect(handler).not.toHaveBeenCalled();
    // //         obs.set('val', true);
    // //         expect(handler).toHaveBeenCalledWith(true);
    // //     });
    // // });
    // // describe('Shallow', () => {
    // //     test('Shallow 1', () => {
    // //         const obs = observable({ val: false } as { val: boolean; val2?: number });
    // //         const handler = jest.fn();
    // //         obs.onChangeShallow(handler);
    // //         obs.set('val', true);
    // //         expect(handler).not.toHaveBeenCalled();
    // //         obs.set('val2', 10);
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // //     test('Shallow set primitive', () => {
    // //         const obs = observable({ val: false } as { val: boolean; val2?: number });
    // //         const handler = jest.fn();
    // //         obs.onChangeShallow(handler);
    // //         obs.set('val', true);
    // //         expect(handler).not.toHaveBeenCalled();
    // //         obs.set('val2', 10);
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // //     test('Shallow deep object', () => {
    // //         const obs = observable({ val: { val2: { val3: 'hi' } } });
    // //         const handler = jest.fn();
    // //         obs.onChangeShallow(handler);
    // //         obs.val.val2.set('val3', 'hello');
    // //         expect(handler).not.toHaveBeenCalled();
    // //     });
    // //     test('Shallow array', () => {
    // //         const obs = observable({ data: [], selected: 0 });
    // //         const handler = jest.fn();
    // //         obs.data.onChangeShallow(handler);
    // //         obs.data.set([{ text: 1 }, { text: 2 }]);
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //         // Setting an index in an array should notify the array
    // //         obs.data.set(0, { text: 11 });
    // //         expect(handler).toHaveBeenCalledTimes(2);
    // //     });
    // // });
    // // describe('Computed', () => {
    // //     test('Basic computed', () => {
    // //         const obs = observable({ test: 10, test2: 20 });
    // //         const computed = observableComputed([obs.prop('test'), obs.prop('test2')], (test, test2) => test + test2);
    // //         expect(computed.current).toEqual(30);
    // //     });
    // //     test('Multiple computed changes', () => {
    // //         const obs = observable({ test: 10, test2: 20 });
    // //         const computed = observableComputed([obs.prop('test'), obs.prop('test2')], (test, test2) => test + test2);
    // //         expect(computed.current).toEqual(30);
    // //         const handler = jest.fn();
    // //         computed.onChange(handler);
    // //         obs.set('test', 5);
    // //         expect(handler).toHaveBeenCalledWith(25, { value: 25, path: [], prevValue: 30 });
    // //         expect(computed.current).toEqual(25);
    // //         obs.set('test', 1);
    // //         expect(handler).toHaveBeenCalledWith(21, { value: 21, path: [], prevValue: 25 });
    // //         expect(computed.current).toEqual(21);
    // //     });
    // //     test('Cannot directly set a computed', () => {
    // //         const obs = observable({ test: 10, test2: 20 });
    // //         const computed = observableComputed([obs.prop('test'), obs.prop('test2')], (test, test2) => test + test2);
    // //         // @ts-expect-error
    // //         computed.set(40);
    // //         // @ts-expect-error
    // //         computed.assign({ text: 'hi' });
    // //         // @ts-expect-error
    // //         computed.delete();
    // //     });
    // // });
    // // describe('Event', () => {
    // //     test('Event', () => {
    // //         const event = observableEvent();
    // //         const handler = jest.fn();
    // //         event.on(handler);
    // //         expect(handler).not.toHaveBeenCalled();
    // //         event.fire();
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //         event.fire();
    // //         event.fire();
    // //         event.fire();
    // //         expect(handler).toHaveBeenCalledTimes(4);
    // //     });
    // // });
    // // describe('Promise values', () => {
    // //     test('Promise value', async () => {
    // //         const promise = Promise.resolve(10);
    // //         const obs = observable({ promise });
    // //         expect(obs.promise).resolves.toEqual(10);
    // //     });
    // // });
    // // describe('Batching', () => {
    // //     test('Assign is batched', async () => {
    // //         const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
    // //         const handler = jest.fn();
    // //         obs.onChange('num1', handler);
    // //         obs.onChange('num2', handler);
    // //         obs.onChange('num3', handler);
    // //         obs.assign({
    // //             num1: 11,
    // //             num2: 22,
    // //             num3: 33,
    // //             obj: { text: 'hello' },
    // //         });
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // //     test('Setting only calls once', async () => {
    // //         const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
    // //         const handler = jest.fn();
    // //         obs.onChange('num1', handler);
    // //         obs.onChange('num2', handler);
    // //         obs.onChange('num3', handler);
    // //         obs.set({
    // //             num1: 11,
    // //             num2: 22,
    // //             num3: 33,
    // //             obj: { text: 'hello' },
    // //         });
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // //     test('Batching is batched', async () => {
    // //         const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
    // //         const handler = jest.fn();
    // //         obs.onChange('num1', handler);
    // //         obs.onChange('num2', handler);
    // //         obs.onChange('num3', handler);
    // //         observableBatcher.begin();
    // //         observableBatcher.begin();
    // //         observableBatcher.begin();
    // //         obs.set({
    // //             num1: 11,
    // //             num2: 22,
    // //             num3: 33,
    // //             obj: { text: 'hello' },
    // //         });
    // //         observableBatcher.end();
    // //         observableBatcher.end();
    // //         observableBatcher.end();
    // //         expect(handler).toHaveBeenCalledTimes(1);
    // //     });
    // // });
    // // describe('Primitive', () => {
    // //     test('Primitive', () => {
    // //         const obs = observable(10);
    // //         expect(obs.current).toEqual(10);
    // //         obs.set(20);
    // //         expect(obs.current).toEqual(20);
    // //     });
    // //     test('Primitive change type', () => {
    // //         const obs = observable<string | number>(10);
    // //         expect(obs.current).toEqual(10);
    // //         obs.set('hello');
    // //         expect(obs.current).toEqual('hello');
    // //     });
    // //     test('Primitive change type', () => {
    // //         const obs = observable<string | number>(10);
    // //         expect(obs.current).toEqual(10);
    // //         // @ts-expect-error
    // //         obs.set({ text: 'hi' });
    // //         // It does work though
    // //         expect(obs.current).toEqual({ text: 'hi' });
    // //     });
});
