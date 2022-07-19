import { assigner, getter, setter } from '../src/observable';
import { disposeListener, observable, observableComputed, observableEvent, shallow } from '../src';
import { getObservableFromPrimitive, listen, listenToObservable } from '../src/observableFns';
import { state } from '../src/observableState';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

describe('Basic', () => {
    test('Has value', () => {
        const obs = observable({ val: 10 });
        expect(obs).toEqual({ val: 10 });
        expect(obs.get()).toEqual({ val: 10 });
        expect(obs.val).toEqual(10);
    });
    test('Comparisons', () => {
        const obs = observable({ val: 10 });
        expect(obs).toEqual({ val: 10 });
        expect(obs.val < 20).toEqual(true);
        // @ts-expect-error
        expect(obs.val < undefined).toEqual(false);
    });
    test('Primitive access', () => {
        const obs = observable({ val: 10 });
        expect(obs.val).toEqual(10);
        expect(obs.val.get()).toEqual(10);
        expect(obs.get().val).toEqual(10);

        obs.val.set(20);

        expect(obs.get().val).toEqual(20);
        expect(obs.val).toEqual(20);
        expect(obs.val).toBe(20);
    });
    test('Deep primitive access', () => {
        const obs = observable({ val: { val2: { val3: 10 } } });
        expect(obs.val.val2.val3).toEqual(10);
        expect(obs.val.val2.val3.get()).toEqual(10);
        expect(obs.val.val2.get().val3).toEqual(10);

        obs.val.val2.val3.set(20);

        expect(obs.val.val2.val3).toEqual(20);
        expect(obs.val.val2.val3.get()).toEqual(20);
        expect(obs.val.val2.get().val3).toEqual(20);
    });
    test('Primitive proxy', () => {
        const obs = observable(10);
        expect(obs).toEqual({ _value: 10 });
        expect(obs.get()).toEqual(10);
    });
    test('Primitive prop', () => {
        const obs = observable({ val: 10 });
        expect(obs.val).toEqual(10);
        expect(getObservableFromPrimitive(obs.val)).toEqual({ _value: 10 });

        obs.val.set(20);

        expect(obs.val).toEqual(20);
        expect(getObservableFromPrimitive(obs.val)).toEqual({ _value: 20 });
    });
    test('Primitive setter bound', () => {
        const obs = observable({ val: 10, val2: 'hello' });

        // Cache the functions
        const get = getter(obs.val);
        const set = setter(obs.val);
        const assign = assigner(obs);

        // Misdirect
        obs.val2.set('hi');

        // Call setter
        set(20);

        expect(obs.val).toEqual(20);
        expect(obs.val.get()).toEqual(20);

        expect(get()).toEqual(20);

        assign({ val: 30 });

        expect(get()).toEqual(30);
    });
    test('Listen to primitive', () => {
        const obs = observable({ val: 10 });
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        obs.val.on('change', handler1);
        listen(obs.val, 'change', handler2);

        obs.val.set(20);

        expect(handler1).toHaveBeenCalledWith(20, { changedValue: 20, path: [], prevValue: 10 });
        expect(handler2).toHaveBeenCalledWith(20, { changedValue: 20, path: [], prevValue: 10 });
    });
    test('No assign on primitives', () => {
        const obs = observable({ val: 10 });

        // @ts-expect-error
        obs.val.assign({ text: 'hi' });
    });
    test('Child objects are proxies', () => {
        const obs = observable({ val: { child: {} as any } });
        const handler = jest.fn();
        listenToObservable(obs.val.child, handler);
        obs.val.child.set({ hello: true });
        expect(handler).toHaveBeenCalledWith(
            { hello: true },
            { changedValue: { hello: true }, path: [], prevValue: {} }
        );
    });
    test('modify value', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        const listener1 = listenToObservable(obs, handler);

        // Set primitive
        obs.val.set(20);
        expect(obs.get()).toEqual({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { changedValue: 20, path: ['val'], prevValue: 10 });

        disposeListener(listener1);

        const handle2 = jest.fn();
        listenToObservable(obs, handle2);

        // Set whole object
        obs.set({ val: 30 });
        expect(obs.get()).toEqual({ val: 30 });
        expect(obs.val.get()).toEqual(30);
        expect(handle2).toHaveBeenCalledWith(
            { val: 30 },
            { changedValue: { val: 30 }, path: [], prevValue: { val: 20 } }
        );
    });
    test('modify value deep', () => {
        const obs = observable({ test: { test2: { test3: { test4: '' } } } });
        const handler = jest.fn();
        listenToObservable(obs, handler);

        obs.test.test2.test3.set({ test4: 'hi' });
        expect(obs.test.test2.test3.test4.get()).toEqual('hi');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { test4: 'hi' } } } },
            {
                changedValue: { test4: 'hi' },
                path: ['test', 'test2', 'test3'],
                prevValue: { test4: '' },
            }
        );

        expect(obs.get()).toEqual({
            test: { test2: { test3: { test4: 'hi' } } },
        });

        obs.test.test2.test3.test4.set('hi2');
        expect(obs.test.test2.test3.test4.get()).toEqual('hi2');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { test4: 'hi2' } } } },
            {
                changedValue: 'hi2',
                path: ['test', 'test2', 'test3', 'test4'],
                prevValue: 'hi',
            }
        );

        expect(obs.get()).toEqual({
            test: { test2: { test3: { test4: 'hi2' } } },
        });
    });
    test('set function deep', () => {
        const obs = observable({ test: { test2: { test3: { test4: '' } } } });
        const handler = jest.fn();
        listenToObservable(obs, handler);

        const ret = obs.test.test2.test3.test4.set('hi');
        expect(ret.get()).toEqual('hi');
        expect(obs.test.test2.test3.test4.get()).toEqual('hi');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { test4: 'hi' } } } },
            {
                changedValue: 'hi',
                path: ['test', 'test2', 'test3', 'test4'],
                prevValue: '',
            }
        );
    });
    test('modify value does not copy object', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toBe(newVal);
    });
    test('modify value retains old listeners', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const handler = jest.fn();
        listenToObservable(obs.test, handler);
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toEqual(newVal);
        expect(obs.get()).toEqual({ test: newVal });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(newVal, {
            changedValue: { test2: 'hello' },
            path: [],
            prevValue: { test2: 'hi' },
        });
    });
    test('set returns correct value', () => {
        const obs = observable({ test: '' });

        const ret = obs.set({ test: 'hello' });
        expect(ret.get()).toEqual({ test: 'hello' });

        const ret2 = obs.test.set('hello');
        expect(ret2.get()).toEqual('hello');
        expect(obs.test.get()).toEqual('hello');
    });
    test('undefined is undefined', () => {
        const obs = observable({ test: undefined });

        expect(obs.test.get()).toEqual(undefined);
    });

    test('Set undefined to value and back', () => {
        const obs = observable({ test: { test2: { test3: undefined } } });
        const handler = jest.fn();
        listenToObservable(obs.test, handler);

        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.test2.test3.get()).toEqual(undefined);

        obs.test.test2.test3.set({ test4: 'hi4', test5: 'hi5' });

        expect(obs.test.test2.test3.get()).toEqual({ test4: 'hi4', test5: 'hi5' });
        expect(obs.test.test2.get()).toEqual({ test3: { test4: 'hi4', test5: 'hi5' } });
        expect(obs.test.get()).toEqual({ test2: { test3: { test4: 'hi4', test5: 'hi5' } } });
        expect(obs.get()).toEqual({ test: { test2: { test3: { test4: 'hi4', test5: 'hi5' } } } });

        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi4', test5: 'hi5' } } },
            {
                changedValue: { test4: 'hi4', test5: 'hi5' },
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
        );

        obs.test.test2.test3.set(undefined);

        expect(obs.test.test2.test3.get()).toEqual(undefined);
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.get()).toEqual({ test: { test2: { test3: undefined } } });

        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: undefined } },
            {
                changedValue: undefined,
                path: ['test2', 'test3'],
                prevValue: { test4: 'hi4', test5: 'hi5' },
            }
        );

        obs.test.test2.test3.set({ test4: 'hi6', test5: 'hi7' });

        expect(obs.test.test2.test3.get()).toEqual({ test4: 'hi6', test5: 'hi7' });
        expect(obs.test.test2.get()).toEqual({ test3: { test4: 'hi6', test5: 'hi7' } });
        expect(obs.test.get()).toEqual({ test2: { test3: { test4: 'hi6', test5: 'hi7' } } });
        expect(obs.get()).toEqual({ test: { test2: { test3: { test4: 'hi6', test5: 'hi7' } } } });

        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi6', test5: 'hi7' } } },
            {
                changedValue: { test4: 'hi6', test5: 'hi7' },
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
        );
    });
    test('Set deep primitive undefined to value and back', () => {
        const obs = observable({ test: { test2: { test3: undefined } } });
        const handler = jest.fn();
        listenToObservable(obs.test, handler);

        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.test2.test3.get()).toEqual(undefined);

        obs.test.test2.test3.set('hi');

        expect(obs.test.test2.test3.get()).toEqual('hi');
        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2.get()).toEqual({ test3: 'hi' });
        expect(obs.test.get()).toEqual({ test2: { test3: 'hi' } });
        expect(obs.get()).toEqual({ test: { test2: { test3: 'hi' } } });

        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi' } },
            {
                changedValue: 'hi',
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
        );

        obs.test.test2.test3.set(undefined);

        expect(obs.test.test2.test3.get()).toEqual(undefined);
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.get()).toEqual({ test: { test2: { test3: undefined } } });

        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: undefined } },
            {
                changedValue: undefined,
                path: ['test2', 'test3'],
                prevValue: 'hi',
            }
        );

        obs.test.test2.test3.set('hi');

        expect(obs.test.test2.test3).toEqual('hi');
        expect(obs.test.test2.test3.get()).toEqual('hi');
        expect(obs.test.test2).toEqual({ test3: 'hi' });
        expect(obs.test.test2.get()).toEqual({ test3: 'hi' });
        expect(obs.test.get()).toEqual({ test2: { test3: 'hi' } });
        expect(obs.get()).toEqual({ test: { test2: { test3: 'hi' } } });

        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi' } },
            {
                changedValue: 'hi',
                path: ['test2', 'test3'],
                prevValue: undefined,
            }
        );

        obs.test.test2.set({ test3: 'hi2' });

        expect(obs.test.test2.test3).toEqual('hi2');
        expect(obs.test.test2.test3.get()).toEqual('hi2');
        expect(obs.test.test2).toEqual({ test3: 'hi2' });
        expect(obs.test.test2.get()).toEqual({ test3: 'hi2' });
        expect(obs.test.get()).toEqual({ test2: { test3: 'hi2' } });
        expect(obs.get()).toEqual({ test: { test2: { test3: 'hi2' } } });

        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: 'hi2' } },
            {
                changedValue: { test3: 'hi2' },
                path: ['test2'],
                prevValue: { test3: 'hi' },
            }
        );
    });
    test('Set number key', () => {
        const obs = observable({ test: {} as Record<number, string> });
        const handler = jest.fn();
        listenToObservable(obs.test, handler);

        obs.test.set(1, 'hi');

        expect(handler).toHaveBeenCalledWith(
            { '1': 'hi' },
            {
                changedValue: 'hi',
                path: ['1'],
                prevValue: undefined,
            }
        );
    });

    test('Set number key multiple times', () => {
        const obs = observable({ test: { t: {} as Record<number, any> } });
        const handler = jest.fn();
        listenToObservable(obs.test, handler);

        obs.test.t.set('1000', { test1: { text: ['hi'] } });
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
            { t: { '1000': { test1: { text: ['hi'] } } } },
            {
                changedValue: { test1: { text: ['hi'] } },
                path: ['t', '1000'],
                prevValue: undefined,
            }
        );
        expect(Object.keys(obs.test.t[1000])).toEqual(['test1']);

        obs.test.t.set(1000, { test1: { text: ['hi'] }, test2: { text: ['hi2'] } });
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

        expect(Object.keys(obs.test.t.get()['1000'])).toEqual(['test1', 'test2']);
        expect(Object.keys(obs.test.t['1000'])).toEqual(['test1', 'test2']);

        expect(obs.test.t.get()).toEqual({
            1000: {
                test1: { text: ['hi'] },
                test2: { text: ['hi2'] },
            },
        });

        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } } } },
            {
                changedValue: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
                path: ['t', '1000'],
                prevValue: { test1: { text: ['hi'] } },
            }
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
            {
                changedValue: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } },
                path: ['t', '1000'],
                prevValue: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
            }
        );
    });
    test('Set does not fire if unchanged', () => {
        const obs = observable({ test: { test1: 'hi' } });
        const handler = jest.fn();
        listenToObservable(obs.test, handler);

        obs.test.test1.set('hi');

        expect(handler).toHaveBeenCalledTimes(0);
    });
    test('Equality', () => {
        const obs = observable({ val: 10 });
        const v = { val: 20 };
        obs.set(v);
        expect(obs === v).toEqual(false);
        expect(obs == v).toEqual(false);
        expect(obs.get() === v).toEqual(true);
    });
});

describe('Assign', () => {
    test('assign', () => {
        const obs = observable({ test: 'hi', test2: { test3: { test4: '' } } });

        obs.test2.assign({ test3: { test4: 'hello' } });
        expect(obs.get()).toEqual({
            test: 'hi',
            test2: {
                test3: {
                    test4: 'hello',
                },
            },
        });
        expect(obs.test2.test3.get()).toEqual({
            test4: 'hello',
        });
    });
    test('assign with existing proxies', () => {
        const obs = observable({ test: 'hi', test2: { test3: { test4: '' } } });
        expect(obs.test2.test3.test4.get()).toEqual('');

        obs.test2.assign({ test3: { test4: 'hello' } });
        expect(obs.get()).toEqual({
            test: 'hi',
            test2: {
                test3: {
                    test4: 'hello',
                },
            },
        });
        expect(obs.test2.test3.get()).toEqual({
            test4: 'hello',
        });
    });
});

describe('Safety', () => {
    test('unsafe', () => {
        const obs = observable({ test: 'hi', test2: { test3: { test4: '' } } }, /*unsafe*/ true);
        obs.test = 'hello';
        obs.test2.test3 = { test4: 'hi5' };
        expect(obs.get()).toEqual({ test: 'hello', test2: { test3: { test4: 'hi5' } } });
    });
    test('unsafe with set', () => {
        const obs = observable({ test: 'hi', test2: { test3: { test4: '' } } }, /*unsafe*/ true);
        obs.test = 'hello';
        obs.test2.test3.set({ test4: 'hi5' });
        expect(obs.get()).toEqual({ test: 'hello', test2: { test3: { test4: 'hi5' } } });
    });
    test('error modifying safe', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = observable({ test: 'hi', test2: { test3: { test4: 'hi4' } } });
        expect(() => {
            // @ts-expect-error
            obs.test = 'hello';
        }).toThrow();
        expect(() => {
            // @ts-expect-error
            obs.test2.test3 = { test4: 'hi5' };
        }).toThrow();
        expect(obs.test.get()).toEqual('hi');
        consoleErrorMock.mockRestore();
    });
    test('error object.assign on safe', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = observable({ test: 'hi', test2: { test3: { test4: 'hi4' } } });
        expect(() => {
            Object.assign(obs, { test: 'hi2' });
        }).toThrow();
        expect(() => {
            Object.assign(obs.test2.test3, { test4: 'hi4' });
        }).toThrow();
        expect(obs.test.get()).toEqual('hi');
        consoleErrorMock.mockRestore();
    });
    test('safe using set function', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = observable({ test: 'hi' });
        obs.test.set('hello');
        expect(consoleErrorMock).not.toHaveBeenCalled();
        expect(obs.test.get()).toEqual('hello');

        consoleErrorMock.mockRestore();
    });
    test('Direct delete has ts error', () => {
        const obs = observable({ val: true });

        expect(() => {
            // @ts-expect-error
            delete obs.val;
        }).toThrowError();

        expect(obs.val.get()).toEqual(true);

        const obsUnsafe = observable({ val: true }, /*unsafe*/ true);

        delete obsUnsafe.val;

        expect(obsUnsafe.val.get()).toEqual(undefined);
    });
    test('Error on defineProperty', () => {
        const obs = observable({ val: true });

        expect(() => {
            Object.defineProperty(obs, 'prop', { value: 10, writable: true });
        }).toThrowError();

        expect(obs.val.get()).toEqual(true);
    });
});

describe('Listeners', () => {
    test('Primitive listener', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith(
            { val: 20 },
            { changedValue: { val: 20 }, path: [], prevValue: { val: 10 } }
        );
    });
    test('Fail with invalid obs', () => {
        expect(() => {
            listenToObservable({ hi: true }, () => {});
        }).toThrow();
        expect(() => {
            listenToObservable(true, () => {});
        }).toThrow();
    });
    test('Listener called for each change', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith(
            { val: 20 },
            { changedValue: { val: 20 }, path: [], prevValue: { val: 10 } }
        );
        obs.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith(
            { val: 21 },
            { changedValue: { val: 21 }, path: [], prevValue: { val: 20 } }
        );
        obs.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith(
            { val: 22 },
            { changedValue: { val: 22 }, path: [], prevValue: { val: 21 } }
        );
        obs.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith(
            { val: 23 },
            { changedValue: { val: 23 }, path: [], prevValue: { val: 22 } }
        );
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Primitive listener with key', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        obs.val.on('change', handler);
        obs.val.set(20);
        expect(handler).toHaveBeenCalledWith(20, { changedValue: 20, path: [], prevValue: 10 });
    });
    test('Non Primitive listener with key', () => {
        const obs = observable({ val: { val2: 10 } });
        const handler = jest.fn();
        listenToObservable(obs.val, handler);
        obs.val.val2.set(20);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { changedValue: 20, path: ['val2'], prevValue: 10 });
    });
    test('Listener with key fires only for key', () => {
        const obs = observable({ val: { val2: 10 }, val3: 'hello' });
        const handler = jest.fn();
        listenToObservable(obs.val, handler);
        obs.val.val2.set(20);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { changedValue: 20, path: ['val2'], prevValue: 10 });
        obs.val3.set('hihi');
        obs.val3.set('hello again');
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Object listener', () => {
        const obs = observable({ test: 'hi' });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: 'hello' },
            { changedValue: 'hello', path: ['test'], prevValue: 'hi' }
        );
    });
    test('Deep object listener', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.test2.test3.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { changedValue: 'hello', path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set primitive undefined', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.test2.test3.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: undefined } } },
            { changedValue: undefined, path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Set undefined', () => {
        const obs = observable({ test: 'hi' });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.set(undefined);
        expect(handler).toHaveBeenCalledWith(undefined, {
            changedValue: undefined,
            path: [],
            prevValue: { test: 'hi' },
        });
    });
    test('Deep object set undefined', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.test2.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: undefined } },
            { changedValue: undefined, path: ['test', 'test2'], prevValue: { test3: 'hi' } }
        );
    });
    test('Start null set to something', () => {
        const obs = observable({ test: null });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.set({ test2: 'hi' });
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi' } },
            {
                changedValue: { test2: 'hi' },
                path: ['test'],
                prevValue: null,
            }
        );
    });
    test('Start undefined set to something', () => {
        const obs = observable({ test: undefined });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.set({ test2: 'hi' });
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi' } },
            {
                changedValue: { test2: 'hi' },
                path: ['test'],
                prevValue: undefined,
            }
        );
    });
    test('Set with object should only fire listeners once', () => {
        const obs = observable({ test: undefined });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.set({ test2: 'hi', test3: 'hi3', test4: 'hi4' });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi', test3: 'hi3', test4: 'hi4' } },
            {
                changedValue: { test2: 'hi', test3: 'hi3', test4: 'hi4' },
                path: ['test'],
                prevValue: undefined,
            }
        );
    });
    test('Listener promises', async () => {
        const obs = observable({ test: 'hi' });
        const promise = obs.test.on('equals', 'hi2').promise;
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
        obs.on('change', handlerRoot);
        const handler1 = jest.fn();
        obs.test1.on('change', handler1);
        const handler2 = jest.fn();
        obs.test1.test2.on('change', handler2);
        const handler3 = jest.fn();
        obs.test1.test2.test3.on('change', handler3);
        const handler4 = jest.fn();
        obs.test1.test2.test3.test4.on('change', handler4);
        obs.test1.test2.test3.test4.set('hi');
        expect(handlerRoot).toHaveBeenCalledWith(
            { test1: { test2: { test3: { test4: 'hi' } } } },
            { changedValue: 'hi', path: ['test1', 'test2', 'test3', 'test4'], prevValue: '' }
        );
        expect(handler1).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi' } } },
            { changedValue: 'hi', path: ['test2', 'test3', 'test4'], prevValue: '' }
        );
        expect(handler2).toHaveBeenCalledWith(
            { test3: { test4: 'hi' } },
            { changedValue: 'hi', path: ['test3', 'test4'], prevValue: '' }
        );
        expect(handler3).toHaveBeenCalledWith({ test4: 'hi' }, { changedValue: 'hi', path: ['test4'], prevValue: '' });
        expect(handler4).toHaveBeenCalledWith('hi', {
            changedValue: 'hi',
            path: [],
            prevValue: '',
        });
    });
    test('Set with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = jest.fn();
        listenToObservable(obs.obj.test, handler);
        obs.set({ obj: { test: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', {
            changedValue: 'hello',
            path: [],
            prevValue: 'hi',
        });
    });
    test('Set undefined deep with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = jest.fn();
        listenToObservable(obs.obj.test, handler);

        obs.obj.test.set(undefined);

        expect(handler).toHaveBeenCalledWith(undefined, {
            changedValue: undefined,
            path: [],
            prevValue: 'hi',
        });
    });
    test('Set undefined with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = jest.fn();
        listenToObservable(obs.obj.test, handler);

        obs.set(undefined);

        expect(handler).toHaveBeenCalledWith(undefined, {
            changedValue: undefined,
            path: [],
            prevValue: 'hi',
        });
    });
});
describe('Arrays', () => {
    test('Array push', () => {
        const obs = observable({ test: ['hi'] });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.push('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: ['hi', 'hello'] },
            { changedValue: ['hi', 'hello'], path: ['test'], prevValue: ['hi'] }
        );
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Array set at index should fail on safe', () => {
        const obs = observable({ test: ['hi'] });
        expect(() => {
            // @ts-expect-error
            obs.test[1] = 'hello';
        }).toThrow();
    });
    test('Array set at index should succeed on unsafe', () => {
        const obs = observable({ test: ['hi'] }, /*unsafe*/ true);
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test[1] = 'hello';
        expect(handler).toHaveBeenCalledWith(
            { test: ['hi', 'hello'] },
            { changedValue: ['hi', 'hello'], path: ['test'], prevValue: ['hi'] }
        );
    });
    test('Array listener', () => {
        const obs = observable({ test: [{ text: 'hi' }] });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test[0].text.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: [{ text: 'hello' }] },
            { changedValue: 'hello', path: ['test', '0', 'text'], prevValue: 'hi' }
        );
    });
    test('Listener on object in array', () => {
        const obs = observable({ test: [{ text: 'hi' }] });
        const handler = jest.fn();
        obs.test[0].text.on('change', handler);
        obs.test[0].text.set('hello');
        expect(handler).toHaveBeenCalledWith('hello', {
            changedValue: 'hello',
            path: [],
            prevValue: 'hi',
        });

        const handler2 = jest.fn();
        obs.test[0].on('change', handler2);
        obs.test[0].text.set('hello2');
        expect(handler2).toHaveBeenCalledWith(
            { text: 'hello2' },
            {
                changedValue: 'hello2',
                path: ['text'],
                prevValue: 'hello',
            }
        );
    });
});
describe('on functions', () => {
    test('onValue with prop', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        obs.val.on('equals', 20, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(20);
        expect(handler).toHaveBeenCalledWith(20);
    });
    test('onValue deep', () => {
        const obs = observable({ test: { test2: '', test3: '' } });
        const handler = jest.fn();
        obs.test.test2.on('equals', 'hello', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hi');
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hello');
        expect(handler).toHaveBeenCalledWith('hello');
    });
    test('onTrue', () => {
        const obs = observable({ val: false });
        const handler = jest.fn();
        obs.val.on('true', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalledWith(true);
    });
    test('onTrue starting true', () => {
        const obs = observable({ val: true });
        const handler = jest.fn();
        obs.val.on('true', handler);
        expect(handler).toHaveBeenCalled();
        obs.val.set(false);
        expect(handler).toHaveBeenCalledTimes(1);
        obs.val.set(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with false', () => {
        const obs = observable({ val: false });
        const handler = jest.fn();
        obs.val.on('hasValue', handler);
        expect(handler).toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with undefined', () => {
        const obs = observable({ val: undefined });
        const handler = jest.fn();
        obs.val.on('hasValue', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalledWith(true);
    });
});

describe('Shallow', () => {
    test('Shallow 1', () => {
        const obs = observable({ val: false } as { val: boolean; val2?: number });
        const handler = jest.fn();
        obs.on('changeShallow', handler);
        obs.val.set(true);
        expect(handler).not.toHaveBeenCalled();

        obs.set('val2', 10);

        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Shallow set primitive', () => {
        const obs = observable({ val: false } as { val: boolean; val2?: number });
        const handler = jest.fn();
        obs.on('changeShallow', handler);
        obs.val.set(true);
        expect(handler).not.toHaveBeenCalled();

        obs.val2.set(10);

        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Shallow deep object', () => {
        const obs = observable({ val: { val2: { val3: 'hi' } } });
        const handler = jest.fn();
        obs.on('changeShallow', handler);
        obs.val.val2.val3.set('hello');
        expect(handler).not.toHaveBeenCalled();
    });

    test('Shallow function sets trackedProxies', () => {
        const obs = observable({ val: { val2: true } });

        state.isTracking = true;

        const a = shallow(obs.val);
        const tracked = state.trackedProxies[0];

        expect(tracked[0]).toBe(obs.val);
        expect(tracked[1]).toEqual(undefined);
        expect(tracked[2]).toEqual(true);
        expect(a.get() === obs.val.get());

        // Reset state
        state.isTracking = false;
        state.trackedProxies = [];
        state.trackedRootProxies = [];
    });
});

describe('Map', () => {
    test('Map set', () => {
        const obs = observable({ test: new Map() });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.set('key', 'hello');
        expect(handler).toHaveBeenCalledWith(
            { test: new Map([['key', 'hello']]) },
            { changedValue: new Map([['key', 'hello']]), path: ['test'], prevValue: new Map() }
        );
    });
    test('Map clear', () => {
        const obs = observable({ test: new Map() });
        const handler = jest.fn();
        obs.test.set('key', 'hello');
        listenToObservable(obs, handler);
        obs.test.clear();
        expect(handler).toHaveBeenCalledWith(
            { test: new Map() },
            { changedValue: new Map(), path: ['test'], prevValue: new Map([['key', 'hello']]) }
        );
    });
    test('Map delete', () => {
        const obs = observable({ test: new Map() });
        const handler = jest.fn();
        obs.test.set('key', 'hello');
        listenToObservable(obs, handler);
        obs.test.delete('key');
        expect(handler).toHaveBeenCalledWith(
            { test: new Map() },
            { changedValue: new Map(), path: ['test'], prevValue: new Map([['key', 'hello']]) }
        );
    });
});

describe('WeakMap', () => {
    const key = { key: 'key' };
    test('WeakMap set', () => {
        const obs = observable({ test: new WeakMap() });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.set(key, 'hello');
        expect(handler).toHaveBeenCalledWith(
            { test: new WeakMap([[key, 'hello']]) },
            // Note: WeakMap can't provide an accurate prevValue
            { changedValue: new WeakMap([[key, 'hello']]), path: ['test'], prevValue: new WeakMap() }
        );
    });

    test('WeakMap delete', () => {
        const obs = observable({ test: new WeakMap() });
        const handler = jest.fn();
        obs.test.set(key, 'hello');
        listenToObservable(obs, handler);
        obs.test.delete(key);
        expect(handler).toHaveBeenCalledWith(
            { test: new WeakMap() },
            // Note: WeakMap can't provide an accurate prevValue
            { changedValue: new WeakMap(), path: ['test'], prevValue: new WeakMap() }
        );
    });
});

describe('Set', () => {
    test('Set add', () => {
        const obs = observable({ test: new Set() });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.add('testval');
        expect(handler).toHaveBeenCalledWith(
            { test: new Set(['testval']) },
            { changedValue: new Set(['testval']), path: ['test'], prevValue: new Set() }
        );
    });

    test('Set clear', () => {
        const obs = observable({ test: new Set() });
        const handler = jest.fn();
        obs.test.add('testval');
        listenToObservable(obs, handler);
        obs.test.clear();
        expect(handler).toHaveBeenCalledWith(
            { test: new Set() },
            { changedValue: new Set(), path: ['test'], prevValue: new Set(['testval']) }
        );
    });

    test('Set delete', () => {
        const obs = observable({ test: new Set() });
        const handler = jest.fn();
        obs.test.add('testval');
        listenToObservable(obs, handler);
        obs.test.delete('testval');
        expect(handler).toHaveBeenCalledWith(
            { test: new Set() },
            { changedValue: new Set(), path: ['test'], prevValue: new Set(['testval']) }
        );
    });
});

describe('WeakSet', () => {
    const key = { key: 'key' };

    test('WeakSet add', () => {
        const obs = observable({ test: new WeakSet() });
        const handler = jest.fn();
        listenToObservable(obs, handler);
        obs.test.add(key);
        expect(handler).toHaveBeenCalledWith(
            { test: new WeakSet([key]) },
            // Note: WeakSet can't provide an accurate prevValue
            { changedValue: new WeakSet([key]), path: ['test'], prevValue: new WeakSet() }
        );
    });

    test('WeakSet delete', () => {
        const obs = observable({ test: new WeakSet() });
        const handler = jest.fn();
        obs.test.add(key);
        listenToObservable(obs, handler);
        obs.test.delete(key);
        expect(handler).toHaveBeenCalledWith(
            { test: new WeakSet() },
            { changedValue: new WeakSet(), path: ['test'], prevValue: new WeakSet() }
        );
    });
});

describe('Computed', () => {
    test('Basic computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const computed = observableComputed(() => obs.test + obs.test2);
        expect(computed.get()).toEqual(30);
    });
    test('Computed root promitives', () => {
        const obs = observable(10);
        const obs2 = observable(20);
        const computed = observableComputed(() => obs.get() + obs2.get());
        expect(computed.get()).toEqual(30);

        const handler = jest.fn();
        computed.on('change', handler);

        obs.set(5);

        expect(handler).toHaveBeenCalledWith(25, { changedValue: 25, path: [], prevValue: 30 });
        expect(computed.get()).toEqual(25);
    });
    test('Multiple computed changes', () => {
        const obs = observable({ test: 10, test2: 20 });
        const computed = observableComputed(() => obs.test + obs.test2);
        expect(computed.get()).toEqual(30);

        const handler = jest.fn();
        computed.on('change', handler);

        obs.test.set(5);

        expect(handler).toHaveBeenCalledWith(25, { changedValue: 25, path: [], prevValue: 30 });
        expect(computed.get()).toEqual(25);

        obs.test.set(1);

        expect(handler).toHaveBeenCalledWith(21, { changedValue: 21, path: [], prevValue: 25 });
        expect(computed.get()).toEqual(21);
    });
    test('Cannot directly set a computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const computed = observableComputed(() => obs.test + obs.test2);

        // @ts-expect-error
        computed.set(40);

        expect(computed.get()).toEqual(30);

        // @ts-expect-error
        computed.delete();

        expect(computed.get()).toEqual(30);

        // @ts-expect-error
        computed.assign({ text: 'hi' });

        expect(computed.get()).toEqual(30);
    });
});

describe('Deep changes keep listeners', () => {
    test('Deep set keeps listeners', () => {
        const obs = observable({ test: { test2: { test3: 'hello' } } });

        const handler = jest.fn();
        obs.test.test2.test3.on('change', handler);

        obs.set({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });

        expect(handler).toHaveBeenCalledWith('hi there', {
            changedValue: 'hi there',
            path: [],
            prevValue: 'hello',
        });
    });
    test('Deep assign keeps listeners', () => {
        const obs = observable({ test: { test2: { test3: 'hello' } } });

        const handler = jest.fn();
        obs.test.test2.test3.on('change', handler);

        obs.assign({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });

        expect(handler).toHaveBeenCalledWith('hi there', {
            changedValue: 'hi there',
            path: [],
            prevValue: 'hello',
        });
    });

    test('Deep set keeps keys', () => {
        const obs = observable({ test: { test2: {} as Record<string, any> } });

        obs.test.test2.set('a1', { text: 'ta1' });

        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1']);

        obs.test.test2.set('a2', { text: 'ta2' });

        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1', 'a2']);

        obs.test.test2.set('a3', { text: 'ta3' });

        expect(obs.get()).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1', 'a2', 'a3']);
    });

    test('Set shallow of deep object keeps keys', () => {
        const obs = observable({ test: { test2: { a0: { text: 't0' } } as Record<string, any> } });

        obs.test.set({ test2: { a1: { text: 'ta1' } } });

        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1']);

        obs.test.set({ test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } });

        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1', 'a2']);

        obs.test.test2.set('a3', { text: 'ta3' });

        expect(obs.get()).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1', 'a2', 'a3']);

        obs.test.test2.set('a4', { text: 'ta4' });

        expect(obs.get()).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' }, a4: { text: 'ta4' } } },
        });
        expect(obs.test.test2.get()).toEqual({
            a1: { text: 'ta1' },
            a2: { text: 'ta2' },
            a3: { text: 'ta3' },
            a4: { text: 'ta4' },
        });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1', 'a2', 'a3', 'a4']);

        obs.test.test2.assign({ a5: { text: 'ta5' } });

        expect(obs.get()).toEqual({
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
        expect(obs.test.test2.get()).toEqual({
            a1: { text: 'ta1' },
            a2: { text: 'ta2' },
            a3: { text: 'ta3' },
            a4: { text: 'ta4' },
            a5: { text: 'ta5' },
        });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);

        obs.test.test2.set({ a6: { text: 'ta6' } });

        expect(obs.get()).toEqual({
            test: {
                test2: {
                    a6: { text: 'ta6' },
                },
            },
        });
        expect(obs.test.test2.get()).toEqual({
            a6: { text: 'ta6' },
        });
        expect(obs.test.test2.a1.get()).toEqual(undefined);
        expect(Object.keys(obs.test.test2)).toEqual(['a6']);
        expect(Object.keys(obs.test.test2.get())).toEqual(['a6']);
    });
});

describe('Delete', () => {
    test('Delete property', () => {
        const obs = observable({ val: true });
        obs.delete('val');
        expect(obs.get()).toEqual({});
        expect(obs).toEqual({});
        expect(Object.keys(obs.get())).toEqual([]);
        expect(Object.keys(obs)).toEqual([]);

        const obs2 = observable({ val: true, val2: true });
        obs2.delete('val');
        expect(obs2.get()).toEqual({ val2: true });
        expect(Object.keys(obs2.get())).toEqual(['val2']);
        expect(Object.keys(obs2)).toEqual(['val2']);

        obs2.delete('val2');
        expect(obs2.get()).toEqual({});
        expect(Object.keys(obs2.get())).toEqual([]);
        expect(Object.keys(obs2)).toEqual([]);
    });
    test('Delete self', () => {
        const obs = observable({ val: true });
        obs.val.delete();
        expect(obs.get()).toEqual({});
        expect(obs).toEqual({});
        expect(Object.keys(obs.get())).toEqual([]);
        expect(Object.keys(obs)).toEqual([]);

        const obs2 = observable({ val: true, val2: true });
        obs2.val.delete();
        expect(obs2.get()).toEqual({ val2: true });
        expect(Object.keys(obs2.get())).toEqual(['val2']);
        expect(Object.keys(obs2)).toEqual(['val2']);
    });
    test('Delete property fires listeners', () => {
        const obs = observable({ obj: { val: true } });
        const handler = jest.fn();

        obs.obj.val.on('change', handler);

        obs.obj.delete('val');

        expect(handler).toHaveBeenCalledWith(undefined, {
            changedValue: undefined,
            path: [],
            prevValue: true,
        });

        expect(Object.keys(obs.obj)).toEqual([]);
        expect(Object.keys(obs.obj.get())).toEqual([]);
    });
    test('Delete fires listeners of children', () => {
        const obs = observable({ obj: { num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } } });
        const handler = jest.fn();

        obs.obj.num1.on('change', handler);

        obs.delete('obj');

        expect(handler).toHaveBeenCalledWith(undefined, {
            changedValue: undefined,
            path: [],
            prevValue: 1,
        });
    });
});

describe('Event', () => {
    test('Event', () => {
        const event = observableEvent();
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

describe('Functions', () => {
    test('Function not proxied', () => {
        const obs = observable({ val: true, fn: () => obs.val });

        expect(obs.fn()).toBe(true);
    });
});

describe('Proxy promise values', () => {
    test('Proxy promise value', async () => {
        const promise = Promise.resolve(10);
        const obs = observable({ promise });

        expect(obs.promise).resolves.toEqual(10);
    });
});

describe('Batching', () => {
    test('Assign is batched', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });

        const handler = jest.fn();
        obs.num1.on('change', handler);
        obs.num2.on('change', handler);
        obs.num3.on('change', handler);

        obs.assign({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });

        expect(handler).toHaveBeenCalledTimes(1);
    });

    test('Setting is batched', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });

        const handler = jest.fn();
        obs.num1.on('change', handler);
        obs.num2.on('change', handler);
        obs.num3.on('change', handler);

        obs.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });

        expect(handler).toHaveBeenCalledTimes(1);
    });
});
