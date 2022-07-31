import { observableComputed3 } from '../src/observableComputed3';
import { observable3 } from '../src/observable3';
import { observableEvent3 } from '../src/observableEvent3';
import { observableBatcher } from '../src/observableBatcher3';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

describe('Set', () => {
    test('Set', () => {
        const obs = observable3({ test: { text: 't' } });
        // @ts-ignore
        obs.test._.set({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set by key', () => {
        const obs = observable3({ test: { text: 't' } });
        obs.test._.set('text', 't2');
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set child', () => {
        const obs = observable3({ test: { text: { text2: 't' } } });
        obs.test.text._.set({ text2: 't2' });
        expect(obs).toEqual({ test: { text: { text2: 't2' } } });
    });
    test('Set at root', () => {
        const obs = observable3({ test: { text: 't' } });
        obs._.set({ test: { text: 't2' } });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set value does not copy object', () => {
        const obs = observable3({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test._.set(newVal);
        expect(obs.test).toBe(newVal);
    });
});
describe('Assign', () => {
    test('Assign', () => {
        const obs = observable3({ test: { text: 't' } });
        obs.test._.assign({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Assign more keys', () => {
        const obs = observable3<Record<string, any>>({ test: { text: 't' } });
        obs.test._.assign({ text: 'tt', text2: 'tt2' });
        expect(obs).toEqual({ test: { text: 'tt', text2: 'tt2' } });
    });
});
describe('Listeners', () => {
    test('Listen', () => {
        const obs = observable3({ test: { text: 't' }, arr: [] });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test._.onChange(handler);
        obs._.onChange(handler2);

        obs.test._.set({ text: 't2' });
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
        const obs = observable3({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        obs.test._.prop('text')._.onChange(handler);
        obs.test._.set('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
    });
    test('Listen by key', () => {
        const obs = observable3({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        obs.test._.onChange('text', handler);
        obs.test._.set('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
    });
    test('Listen deep', () => {
        const obs = observable3({ test: { test2: { test3: { text: 't' } } } });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test.test2.test3._.onChange('text', handler);
        obs._.onChange(handler2);
        obs.test.test2.test3._.set('text', 't2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
        expect(handler2).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't', value: 't2' }
        );
    });
    test('Listen calls multiple times', () => {
        const obs = observable3({ test: { test2: { test3: { text: 't' } } } });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs.test.test2.test3._.set('text', 't2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't', value: 't2' }
        );
        obs.test.test2.test3._.set('text', 't3');
        expect(obs.test.test2.test3.text).toEqual('t3');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't3' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't2', value: 't3' }
        );
    });
    test('Set calls and maintains deep listeners', () => {
        const obs = observable3({ test: { test2: 'hi' } });
        const handler = jest.fn();
        obs.test._.onChange('test2', handler);
        obs.test._.set({ test2: 'hello' });
        expect(handler).toHaveBeenCalledWith('hello', { path: [], prevValue: 'hi', value: 'hello' });

        obs.test._.set({ test2: 'hi there' });
        expect(obs.test.test2).toEqual('hi there');
        expect(handler).toHaveBeenCalledWith('hi there', { path: [], prevValue: 'hello', value: 'hi there' });
    });
    test('Set on root calls deep listeners', () => {
        const obs = observable3({ test: { test2: 'hi' } });
        const handler = jest.fn();
        obs.test._.onChange('test2', handler);
        obs._.set({ test: { test2: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', { path: [], prevValue: 'hi', value: 'hello' });
    });
    test('Shallow listener', () => {
        const obs = observable3({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test._.onChangeShallow(handler);
        obs._.onChangeShallow(handler2);
        obs.test.test2._.set('test3', 'hello');
        expect(handler).not.toHaveBeenCalled();
        obs.test._.set({ test2: { test3: 'hello' } });
        expect(handler).toHaveBeenCalledTimes(1);
        // Assign adding a new property does notify
        obs.test._.assign({ test4: 'hello' } as any);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler2).toHaveBeenCalledTimes(0);
    });
    test('Listener called for each change', () => {
        const obs = observable3({ test: { val: 10 } });
        const handler = jest.fn();
        obs.test._.onChange(handler);
        expect(handler).not.toHaveBeenCalled();
        obs.test._.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { value: { val: 20 }, path: [], prevValue: { val: 10 } });
        obs.test._.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { value: { val: 21 }, path: [], prevValue: { val: 20 } });
        obs.test._.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { value: { val: 22 }, path: [], prevValue: { val: 21 } });
        obs.test._.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { value: { val: 23 }, path: [], prevValue: { val: 22 } });
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener called for each change at root', () => {
        const obs = observable3({ val: 10 });
        const handler = jest.fn();
        obs._.onChange(handler);
        expect(handler).not.toHaveBeenCalled();
        obs._.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { value: 20, path: ['val'], prevValue: 10 });
        obs._.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { value: 21, path: ['val'], prevValue: 20 });
        obs._.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { value: 22, path: ['val'], prevValue: 21 });
        obs._.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { value: 23, path: ['val'], prevValue: 22 });
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener with key fires only for key', () => {
        const obs = observable3({ val: { val2: 10 }, val3: 'hello' });
        const handler = jest.fn();
        obs.val._.onChange(handler);
        obs.val._.set('val2', 20);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { value: 20, path: ['val2'], prevValue: 10 });
        obs._.set('val3', 'hihi');
        obs._.set('val3', 'hello again');
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Object listener', () => {
        const obs = observable3({ test: 'hi' });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs._.set('test', 'hello');
        expect(handler).toHaveBeenCalledWith({ test: 'hello' }, { value: 'hello', path: ['test'], prevValue: 'hi' });
    });
    test('Deep object listener', () => {
        const obs = observable3({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs.test.test2._.set('test3', 'hello');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { value: 'hello', path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set primitive undefined', () => {
        const obs = observable3({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs.test.test2._.set('test3', undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: undefined } } },
            { value: undefined, path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set undefined', () => {
        const obs = observable3({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs.test.test2._.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: undefined } },
            { value: undefined, path: ['test', 'test2'], prevValue: { test3: 'hi' } }
        );
    });
    test('Start null set to something', () => {
        const obs = observable3({ test: null });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs._.set('test', { test2: 'hi' });
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
        const obs = observable3({ test: undefined });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs._.set('test', { test2: 'hi' });
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
        const obs = observable3({ test: undefined });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs._.set('test', { test2: 'hi', test3: 'hi3', test4: 'hi4' });
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
        const obs = observable3({ test: 'hi' });
        const promise = obs._.onEquals('test', 'hi2').promise;
        let didResolve = false;

        promise.then(() => (didResolve = true));
        expect(didResolve).toEqual(false);

        await promiseTimeout(16);

        obs._.set('test', 'hi2');

        await promiseTimeout(16);

        expect(didResolve).toEqual(true);
    });
    test('Path to change is correct at every level ', () => {
        const obs = observable3({ test1: { test2: { test3: { test4: '' } } } });
        const handlerRoot = jest.fn();
        obs._.onChange(handlerRoot);
        const handler1 = jest.fn();
        obs.test1._.onChange(handler1);
        const handler2 = jest.fn();
        obs.test1.test2._.onChange(handler2);
        const handler3 = jest.fn();
        obs.test1.test2.test3._.onChange(handler3);
        const handler4 = jest.fn();
        obs.test1.test2.test3._.onChange('test4', handler4);
        obs.test1.test2.test3._.set('test4', 'hi');
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
        const obs = observable3({ obj: { test: 'hi' } });
        const handler = jest.fn();
        obs.obj._.onChange('test', handler);
        obs._.set({ obj: { test: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', {
            value: 'hello',
            path: [],
            prevValue: 'hi',
        });
    });
    test('Set undefined deep with deep listener', () => {
        const obs = observable3({ obj: { test: 'hi' } });
        const handler = jest.fn();
        obs.obj._.onChange('test', handler);

        obs.obj._.set('test', undefined);

        expect(handler).toHaveBeenCalledWith(undefined, {
            value: undefined,
            path: [],
            prevValue: 'hi',
        });
    });
    test('Clear array fires listener once', () => {
        const obs = observable3({ arr: ['hi', 'hello', 'there'] });
        const handler = jest.fn();
        obs.arr._.onChange(handler);

        obs._.set('arr', []);

        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Modify value does not copy object', () => {
        const obs = observable3({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test._.set(newVal);
        expect(obs.test).toBe(newVal);
    });
    test('set returns correct value', () => {
        const obs = observable3({ test: '' });

        const ret = obs._.set({ test: 'hello' });
        expect(ret).toEqual({ test: 'hello' });

        const ret2 = obs._.set('test', 'hello');
        expect(ret2).toEqual('hello');
        expect(obs.test).toEqual('hello');

        const ret3 = obs._.assign({ test: 'hello2' });
        expect(obs.test).toEqual('hello2');
        expect(ret3).toEqual({ test: 'hello2' });
        expect(obs).toEqual({ test: 'hello2' });
    });
    test('undefined is undefined', () => {
        const obs = observable3({ test: undefined });

        expect(obs.test).toEqual(undefined);
    });
    test('Set undefined to value and back', () => {
        const obs = observable3({ test: { test2: { test3: undefined } } });
        const handler = jest.fn();
        obs.test._.onChange(handler);

        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test.test2.test3).toEqual(undefined);

        obs.test.test2._.set('test3', { test4: 'hi4', test5: 'hi5' });

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

        obs.test.test2._.set('test3', undefined);

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

        obs.test.test2._.set('test3', { test4: 'hi6', test5: 'hi7' });

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
        const obs = observable3({ test: { test2: { test3: undefined } } });
        const handler = jest.fn();
        obs.test._.onChange(handler);

        expect(obs.test).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2).toEqual({ test3: undefined });
        expect(obs.test.test2.test3).toEqual(undefined);

        obs.test.test2._.set('test3', 'hi');

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

        obs.test.test2._.set('test3', undefined);

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

        obs.test.test2._.set('test3', 'hi');

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

        obs.test.test2._.set({ test3: 'hi2' });

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
        const obs = observable3({ test: {} as Record<number, string> });
        const handler = jest.fn();
        obs.test._.onChange(handler);

        obs.test._.set(1, 'hi');

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
        const obs = observable3({ test: { t: {} as Record<number, any> } });
        const handler = jest.fn();
        obs.test._.onChange(handler);

        obs.test.t._.set('1000', { test1: { text: ['hi'] } });
        expect(obs).toEqual({
            test: {
                t: {
                    '1000': {
                        test1: { text: ['hi'] },
                    },
                },
            },
        });

        expect(handler).toHaveBeenCalledWith(
            { t: { '1000': { test1: { text: ['hi'] } } } },
            {
                value: { test1: { text: ['hi'] } },
                path: ['t', '1000'],
                prevValue: undefined,
            }
        );
        expect(Object.keys(obs.test.t[1000])).toEqual(['test1']);

        obs.test.t._.set(1000, { test1: { text: ['hi'] }, test2: { text: ['hi2'] } });
        expect(obs).toEqual({
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

        expect(obs.test.t).toEqual({
            1000: {
                test1: { text: ['hi'] },
                test2: { text: ['hi2'] },
            },
        });

        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } } } },
            {
                value: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
                path: ['t', '1000'],
                prevValue: { test1: { text: ['hi'] } },
            }
        );

        obs.test.t._.set(1000, { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } });
        expect(obs.test.t).toEqual({
            1000: {
                test1: { text: ['hiz'], text2: 'hiz2' },
                test2: { text: ['hi2'] },
            },
        });

        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } } } },
            {
                value: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } },
                path: ['t', '1000'],
                prevValue: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
            }
        );
    });
    test('Set does not fire if unchanged', () => {
        const obs = observable3({ test: { test1: 'hi' } });
        const handler = jest.fn();
        obs.test._.onChange(handler);

        obs.test._.set('test1', 'hi');

        expect(handler).toHaveBeenCalledTimes(0);
    });
    test('Equality', () => {
        const obs = observable3({ val: { val2: 10 } });
        const v = { val2: 20 };
        obs.val._.set(v);
        expect(obs.val === v).toEqual(true);
        expect(obs.val == v).toEqual(true);
    });
    test('Primitive has no keys', () => {
        const obs = observable3({ val: 10 });
        expect(Object.keys(obs.val)).toEqual([]);
    });
    test('Set key on undefined fails', () => {
        const obs = observable3({ val: undefined });
        expect(() => {
            obs.val.set('key', 10);
        }).toThrow();
        expect(obs.val).toEqual(undefined);
    });
});
describe('Safety', () => {
    test('Prevent writes', () => {
        const obs = observable3({ test: { text: 't' } });
        // @ts-expect-error
        obs.test.text = 'hello';
        // @ts-expect-error
        obs.test = { text: 'hello' };
        // @ts-expect-error
        delete obs.test;
    });
});
describe('Primitives', () => {
    test('Primitive set', () => {
        const obs = observable3({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        obs.test._.set('text', 't2');
        expect(obs.test.text).toEqual('t2');
    });
    test('Deep primitive access', () => {
        const obs = observable3({ val: { val2: { val3: 10 } } });
        expect(obs.val.val2.val3).toEqual(10);
        obs.val.val2._.set('val3', 20);
        expect(obs.val.val2.val3).toEqual(20);
    });
    test('Primitive set not allowed', () => {
        const obs = observable3({ val: 10 });
        expect(obs.val).toBe(10);
        expect(() => {
            // @ts-expect-error
            obs.val._.set(20);
        }).toThrow();
        expect(obs.val).toEqual(10);
    });
    test('Primitive root not allowed', () => {
        // @ts-expect-error
        const obs = observable3(10);
    });
});
describe('Array', () => {
    test('Basic array', () => {
        const obs = observable3({ arr: [] });
        expect(obs.arr).toEqual([]);
        obs.arr._.set([1, 2, 3]);
        expect(obs.arr).toEqual([1, 2, 3]);
    });
    test('Array functions', () => {
        const obs = observable3({ arr: [] });
        const handler = jest.fn();
        obs.arr._.onChange(handler);
    });
    test('Array still has builtin functions', () => {
        const obs = observable3({ arr: [1, 2] });
        expect(obs.arr.map((a) => a)).toEqual([1, 2]);
    });
    test('Array push', () => {
        const obs = observable3({ test: ['hi'] });
        const handler = jest.fn();
        obs._.onChange(handler);
        obs.test.push('hello');
        expect(obs.test).toEqual(['hi', 'hello']);
        expect(handler).toHaveBeenCalledWith(
            { test: ['hi', 'hello'] },
            { value: ['hi', 'hello'], path: ['test'], prevValue: ['hi'] }
        );
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Array splice', () => {
        const obs = observable3({ test: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }] });
        const handler = jest.fn();
        obs._.onChange(handler);
        const last = obs.test[2];
        obs.test.splice(1, 1);
        expect(obs.test).toEqual([{ text: 'hi' }, { text: 'there' }]);
        expect(obs.test[1]).toBe(last);
        expect(handler).toHaveBeenCalledWith(
            { test: [{ text: 'hi' }, { text: 'there' }] },
            {
                value: [{ text: 'hi' }, { text: 'there' }],
                path: ['test'],
                prevValue: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }],
            }
        );
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Array swap', () => {
        const obs = observable3({ test: [1, 2, 3, 4, 5] });
        let tmp = obs.test[1];
        obs.test._.set(1, obs.test[4]);
        obs.test._.set(4, tmp);
        expect(obs.test).toEqual([1, 5, 3, 4, 2]);
        tmp = obs.test[1];
        obs.test._.set(1, obs.test[4]);
        obs.test._.set(4, tmp);
        expect(obs.test).toEqual([1, 2, 3, 4, 5]);
    });
    test('Array set', () => {
        const obs = observable3({ test: [] });
        const arr = [];
        for (let i = 0; i < 1000; i++) {
            arr[i] = { id: i };
        }
        obs.test._.set(arr);
        expect(obs.test.length).toEqual(1000);
        expect(obs.test[3].id).toEqual(3);
    });
    test('Array swap with objects', () => {
        const obs = observable3({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        let arr = obs.test;

        let tmp = arr[1];
        obs.test._.set(1, arr[4]);
        obs.test._.set(4, tmp);

        expect(obs.test).toEqual([{ text: 1 }, { text: 5 }, { text: 3 }, { text: 4 }, { text: 2 }]);
        expect(obs.test[1]).toEqual({ text: 5 });
        expect(arr[1]).toEqual({ text: 5 });
        expect(obs.test[4]).toEqual({ text: 2 });
        expect(arr[4]).toEqual({ text: 2 });

        tmp = arr[1];
        obs.test._.set(1, arr[4]);
        obs.test._.set(4, tmp);

        expect(obs.test).toEqual([{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
    });
    test('Array swap if empty', () => {
        const obs = observable3({ test: [] });

        let tmp = obs.test[1];
        obs.test._.set(1, obs.test[4]);

        expect(obs.test).toEqual([undefined, undefined]);

        obs.test._.set(4, tmp);

        expect(obs.test).toEqual([undefined, undefined, undefined, undefined, undefined]);
    });
    test('Array clear if listening', () => {
        let obs = observable3({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        obs.test[0]._.onChange(() => {});
        obs.test[1]._.onChange(() => {});
        obs.test[2]._.onChange(() => {});
        obs.test[3]._.onChange(() => {});
        obs.test[4]._.onChange(() => {});

        obs.test._.set([]);

        expect(obs.test).toEqual([]);
        expect(obs.test).toEqual([]);
        expect(obs.test.length).toEqual(0);
        expect(obs.test.length).toEqual(0);
        expect(obs.test.map((a) => a)).toEqual([]);
    });
    test('Array splice fire events', () => {
        let obs = observable3({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        const handler = jest.fn();
        obs.test._.onChange(handler);
        obs.test[0]._.onChange(() => {});
        obs.test[1]._.onChange(() => {});
        obs.test[2]._.onChange(() => {});
        obs.test[3]._.onChange(() => {});
        obs.test[4]._.onChange(() => {});

        obs.test.splice(0, 1);

        expect(obs.test[0]).toEqual({ text: 2 });
        expect(obs.test[0]).toEqual({ text: 2 });
        expect(obs.test).toEqual([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
        expect(obs.test).toEqual([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
        expect(obs.test.length).toEqual(4);
        expect(obs.test.length).toEqual(4);
        expect(obs.test.map((a) => a)).toEqual([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);

        // TODO
        // expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith([{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }], {
            value: [{ text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }],
            path: [],
            prevValue: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }],
        });
    });
    test('Array with listeners clear', () => {
        let obs = observable3({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        const handler = jest.fn();
        obs.test._.onChangeShallow(handler);
        obs.test[0]._.onChange(() => {});
        obs.test[1]._.onChange(() => {});
        obs.test[2]._.onChange(() => {});
        obs.test[3]._.onChange(() => {});
        obs.test[4]._.onChange(() => {});

        obs.test._.set([]);
    });
    test('Array set by index', () => {
        const obs = observable3({ test: [{ text: 'hi' }] });
        obs.test[0]._.set({ text: 'hi2' });
        expect(obs.test[0]).toEqual({ text: 'hi2' });
    });
});
describe('Deep changes keep listeners', () => {
    test('Deep set keeps listeners', () => {
        const obs = observable3({ test: { test2: { test3: 'hello' } } });

        const handler = jest.fn();
        obs.test.test2._.onChange('test3', handler);

        obs._.set({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });

        expect(handler).toHaveBeenCalledWith('hi there', {
            value: 'hi there',
            path: [],
            prevValue: 'hello',
        });
    });
    test('Deep assign keeps listeners', () => {
        const obs = observable3({ test: { test2: { test3: 'hello' } } });

        const handler = jest.fn();
        obs.test.test2._.onChange('test3', handler);

        obs._.assign({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });

        expect(handler).toHaveBeenCalledWith('hi there', {
            value: 'hi there',
            path: [],
            prevValue: 'hello',
        });
    });

    test('Deep set keeps keys', () => {
        const obs = observable3({ test: { test2: {} as Record<string, any> } });

        obs.test.test2._.set('a1', { text: 'ta1' });

        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);

        obs.test.test2._.set('a2', { text: 'ta2' });

        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);

        obs.test.test2._.set('a3', { text: 'ta3' });

        expect(obs).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
    });

    test('Set shallow of deep object keeps keys', () => {
        const obs = observable3({ test: { test2: { a0: { text: 't0' } } as Record<string, any> } });

        obs.test._.set({ test2: { a1: { text: 'ta1' } } });

        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);

        obs.test._.set({ test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } });

        expect(obs).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);

        obs.test.test2._.set('a3', { text: 'ta3' });

        expect(obs).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);

        obs.test.test2._.set('a4', { text: 'ta4' });

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

        obs.test.test2._.assign({ a5: { text: 'ta5' } });

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

        obs.test.test2._.set({ a6: { text: 'ta6' } });

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
        const obs = observable3({ test: { text: 't', text2: 't2' } });
        obs.test._.delete('text2');
        expect(obs).toEqual({ test: { text: 't' } });
    });
    test('Delete self', () => {
        const obs = observable3({ test: { text: 't' }, test2: { text2: 't2' } });
        obs.test2._.delete();
        expect(obs).toEqual({ test: { text: 't' } });
    });
    test('Delete property fires listeners', () => {
        const obs = observable3({ obj: { val: true } });
        const handler = jest.fn();

        obs.obj._.onChange('val', handler);
        obs.obj._.delete('val');

        expect(handler).toHaveBeenCalledWith(undefined, {
            value: undefined,
            path: [],
            prevValue: true,
        });

        expect(Object.keys(obs.obj)).toEqual([]);
    });
    test('Delete fires listeners of children', () => {
        const obs = observable3({ obj: { num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } } });
        const handler = jest.fn();
        obs.obj._.onChange('num1', handler);

        obs._.delete('obj');

        expect(handler).toHaveBeenCalledWith(undefined, {
            value: undefined,
            path: [],
            prevValue: 1,
        });
    });
});
describe('on functions', () => {
    test('onValue with prop', () => {
        const obs = observable3({ val: 10 });
        const handler = jest.fn();
        obs._.prop('val')._.onEquals(20, handler);
        expect(handler).not.toHaveBeenCalled();
        obs._.set('val', 20);
        expect(handler).toHaveBeenCalledWith(20);
    });
    test('onValue deep', () => {
        const obs = observable3({ test: { test2: '', test3: '' } });
        const handler = jest.fn();
        obs.test._.onEquals('test2', 'hello', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.test._.set('test2', 'hi');
        expect(handler).not.toHaveBeenCalled();
        obs.test._.set('test2', 'hello');
        expect(handler).toHaveBeenCalledWith('hello');
    });
    test('onTrue', () => {
        const obs = observable3({ val: false });
        const handler = jest.fn();
        obs._.onTrue('val', handler);
        expect(handler).not.toHaveBeenCalled();
        obs._.set('val', true);
        expect(handler).toHaveBeenCalledWith(true);
    });
    test('onTrue starting true', () => {
        const obs = observable3({ val: true });
        const handler = jest.fn();
        obs._.onTrue('val', handler);
        expect(handler).toHaveBeenCalled();
        obs._.set('val', false);
        expect(handler).toHaveBeenCalledTimes(1);
        obs._.set('val', true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with false', () => {
        const obs = observable3({ val: false });
        const handler = jest.fn();
        obs._.onHasValue('val', handler);
        expect(handler).toHaveBeenCalled();
        obs._.set('val', true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with undefined', () => {
        const obs = observable3({ val: undefined });
        const handler = jest.fn();
        obs._.onHasValue('val', handler);
        expect(handler).not.toHaveBeenCalled();
        obs._.set('val', true);
        expect(handler).toHaveBeenCalledWith(true);
    });
});
describe('Shallow', () => {
    test('Shallow 1', () => {
        const obs = observable3({ val: false } as { val: boolean; val2?: number });
        const handler = jest.fn();
        obs._.onChangeShallow(handler);
        obs._.set('val', true);
        expect(handler).not.toHaveBeenCalled();

        obs._.set('val2', 10);

        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Shallow set primitive', () => {
        const obs = observable3({ val: false } as { val: boolean; val2?: number });
        const handler = jest.fn();
        obs._.onChangeShallow(handler);
        obs._.set('val', true);
        expect(handler).not.toHaveBeenCalled();

        obs._.set('val2', 10);

        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Shallow deep object', () => {
        const obs = observable3({ val: { val2: { val3: 'hi' } } });
        const handler = jest.fn();
        obs._.onChangeShallow(handler);
        obs.val.val2._.set('val3', 'hello');
        expect(handler).not.toHaveBeenCalled();
    });
    test('Shallow array', () => {
        const obs = observable3({ data: [], selected: 0 });
        const handler = jest.fn();
        obs.data._.onChangeShallow(handler);

        obs.data._.set([{ text: 1 }, { text: 2 }]);

        expect(handler).toHaveBeenCalledTimes(1);

        obs.data[0]._.set({ text: 11 });

        expect(handler).toHaveBeenCalledTimes(1);
    });
});
describe('Computed', () => {
    test('Basic computed', () => {
        const obs = observable3({ test: 10, test2: 20 });
        const computed = observableComputed3([obs._.prop('test'), obs._.prop('test2')], (test, test2) => test + test2);
        expect(computed.current).toEqual(30);
    });
    test('Multiple computed changes', () => {
        const obs = observable3({ test: 10, test2: 20 });
        const computed = observableComputed3([obs._.prop('test'), obs._.prop('test2')], (test, test2) => test + test2);
        expect(computed.current).toEqual(30);

        const handler = jest.fn();
        computed._.onChange(handler);

        obs._.set('test', 5);

        expect(handler).toHaveBeenCalledWith(25, { value: 25, path: [], prevValue: 30 });
        expect(computed.current).toEqual(25);

        obs._.set('test', 1);

        expect(handler).toHaveBeenCalledWith(21, { value: 21, path: [], prevValue: 25 });
        expect(computed.current).toEqual(21);
    });
    test('Cannot directly set a computed', () => {
        const obs = observable3({ test: 10, test2: 20 });
        const computed = observableComputed3([obs._.prop('test'), obs._.prop('test2')], (test, test2) => test + test2);

        // @ts-expect-error
        computed._.set(40);

        expect(computed.current).toEqual(30);

        // @ts-expect-error
        computed._.delete();

        expect(computed.current).toEqual(30);

        // @ts-expect-error
        computed._.assign({ text: 'hi' });

        expect(computed.current).toEqual(30);
    });
});
describe('Event', () => {
    test('Event', () => {
        const event = observableEvent3();
        const handler = jest.fn();
        event.on(handler);

        expect(handler).not.toHaveBeenCalled();

        event.fire();
        expect(handler).toHaveBeenCalledTimes(1);

        event.fire();
        event.fire();
        event.fire();
        expect(handler).toHaveBeenCalledTimes(4);
    });
});
describe('Promise values', () => {
    test('Promise value', async () => {
        const promise = Promise.resolve(10);
        const obs = observable3({ promise });

        expect(obs.promise).resolves.toEqual(10);
    });
});
describe('Batching', () => {
    test('Assign is batched', async () => {
        const obs = observable3({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });

        const handler = jest.fn();
        obs._.onChange('num1', handler);
        obs._.onChange('num2', handler);
        obs._.onChange('num3', handler);

        obs._.assign({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });

        expect(handler).toHaveBeenCalledTimes(1);
    });

    test('Setting only calls once', async () => {
        const obs = observable3({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });

        const handler = jest.fn();
        obs._.onChange('num1', handler);
        obs._.onChange('num2', handler);
        obs._.onChange('num3', handler);

        obs._.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });

        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Batching is batched', async () => {
        const obs = observable3({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = jest.fn();
        obs._.onChange('num1', handler);
        obs._.onChange('num2', handler);
        obs._.onChange('num3', handler);
        observableBatcher.begin();
        observableBatcher.begin();
        observableBatcher.begin();
        obs._.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        observableBatcher.end();
        observableBatcher.end();
        observableBatcher.end();
        expect(handler).toHaveBeenCalledTimes(1);
    });
});
