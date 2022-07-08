import { disposeListener, listenToObs, obsProxy, obsProxyComputed } from '../src';

describe('Basic', () => {
    test('Has value', () => {
        const obs = obsProxy({ val: 10 });
        expect(obs.get()).toEqual({ val: 10 });
        expect(obs.val.get()).toEqual(10);
    });
    test('Primitive access', () => {
        const obs = obsProxy({ val: 10 });
        expect(obs.val.get()).toEqual(10);
        expect(obs.get().val).toEqual(10);
    });
    test('Primitive proxy', () => {
        const obs = obsProxy(10);
        expect(obs.get()).toEqual(10);
    });
    test('Child objects are proxies', () => {
        const obs = obsProxy({ val: { child: {} } });
        const handler = jest.fn();
        listenToObs(obs.val.child, handler);
        obs.val.child.set({ hello: true });
        expect(handler).toHaveBeenCalledWith(
            { hello: true },
            { changedValue: { hello: true }, path: [], prevValue: {} }
        );
    });
    test('modify value', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        const listener1 = listenToObs(obs, handler);

        // Set primitive
        obs.val.set(20);
        expect(obs.get()).toEqual({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { changedValue: 20, path: ['val'], prevValue: 10 });

        disposeListener(listener1);

        const handle2 = jest.fn();
        listenToObs(obs, handle2);

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
        const obs = obsProxy({ test: { test2: { test3: { test4: '' } } } });
        const handler = jest.fn();
        listenToObs(obs, handler);

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
    });
    test('set function deep', () => {
        const obs = obsProxy({ test: { test2: { test3: { test4: '' } } } });
        const handler = jest.fn();
        listenToObs(obs, handler);

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
        const obs = obsProxy({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toBe(newVal);
    });
    test('modify value retains old listeners', () => {
        const obs = obsProxy({ test: { test2: 'hi' } });
        const handler = jest.fn();
        listenToObs(obs.test, handler);
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
        const obs = obsProxy({ test: '' });

        const ret = obs.set({ test: 'hello' });
        expect(ret.get()).toEqual({ test: 'hello' });

        const ret2 = obs.test.set('hello');
        expect(ret2.get()).toEqual('hello');
        expect(obs.test.get()).toEqual('hello');
    });
    test('undefined is undefined', () => {
        const obs = obsProxy({ test: undefined });

        expect(obs.test.get()).toEqual(undefined);
    });

    test('Set undefined to value and back', () => {
        const obs = obsProxy({ test: { test2: { test3: undefined } } });
        const handler = jest.fn();
        listenToObs(obs.test, handler);

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
        const obs = obsProxy({ test: { test2: { test3: undefined } } });
        const handler = jest.fn();
        listenToObs(obs.test, handler);

        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.test2.test3.get()).toEqual(undefined);

        obs.test.test2.test3.set('hi');

        expect(obs.test.test2.test3.get()).toEqual('hi');
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

        expect(obs.test.test2.test3.get()).toEqual('hi');
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
    });
    test('Set number key', () => {
        const obs = obsProxy({ test: {} as Record<number, string> });
        const handler = jest.fn();
        listenToObs(obs.test, handler);

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
});

describe('Assign', () => {
    test('assign', () => {
        const obs = obsProxy({ test: 'hi', test2: { test3: { test4: '' } } });

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
        const obs = obsProxy({ test: 'hi', test2: { test3: { test4: '' } } });
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
        const obs = obsProxy({ test: 'hi', test2: { test3: { test4: '' } } }, /*unsafe*/ true);
        obs.test = 'hello';
        obs.test2.test3 = { test4: 'hi5' };
        expect(obs.get()).toEqual({ test: 'hello', test2: { test3: { test4: 'hi5' } } });
    });
    test('error modifying safe', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = obsProxy({ test: 'hi', test2: { test3: { test4: 'hi4' } } });
        expect(() => {
            // @ts-ignore This is meant to error
            obs.test = 'hello';
        }).toThrow();
        expect(() => {
            // @ts-ignore This is meant to error
            obs.test2.test3 = { test4: 'hi5' };
        }).toThrow();
        expect(obs.test.get()).toEqual('hi');
        consoleErrorMock.mockRestore();
    });
    test('error object.assign on safe', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = obsProxy({ test: 'hi', test2: { test3: { test4: 'hi4' } } });
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
        const obs = obsProxy({ test: 'hi' });
        obs.test.set('hello');
        expect(consoleErrorMock).not.toHaveBeenCalled();
        expect(obs.test.get()).toEqual('hello');

        consoleErrorMock.mockRestore();
    });
});

describe('Listeners', () => {
    test('Primitive listener', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        listenToObs(obs, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith(
            { val: 20 },
            { changedValue: { val: 20 }, path: [], prevValue: { val: 10 } }
        );
    });
    test('Fail with invalid obs', () => {
        expect(() => {
            // @ts-ignore This is meant to error
            listenToObs({ hi: true }, () => {});
        }).toThrow();
        expect(() => {
            // @ts-ignore This is meant to error
            listenToObs(true, () => {});
        }).toThrow();
    });
    test('Listener called for each change', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        listenToObs(obs, handler);
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
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        listenToObs(obs.val, handler);
        obs.val.set(20);
        expect(handler).toHaveBeenCalledWith(20, { changedValue: 20, path: [], prevValue: 10 });
    });
    test('Non Primitive listener with key', () => {
        const obs = obsProxy({ val: { val2: 10 } });
        const handler = jest.fn();
        listenToObs(obs.val, handler);
        obs.val.val2.set(20);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { changedValue: 20, path: ['val2'], prevValue: 10 });
    });
    test('Listener with key fires only for key', () => {
        const obs = obsProxy({ val: { val2: 10 }, val3: 'hello' });
        const handler = jest.fn();
        listenToObs(obs.val, handler);
        obs.val.val2.set(20);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { changedValue: 20, path: ['val2'], prevValue: 10 });
        obs.val3.set('hihi');
        obs.val3.set('hello again');
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Object listener', () => {
        const obs = obsProxy({ test: 'hi' });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: 'hello' },
            { changedValue: 'hello', path: ['test'], prevValue: 'hi' }
        );
    });
    test('Deep object listener', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.test2.test3.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { changedValue: 'hello', path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set primitive undefined', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.test2.test3.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: undefined } } },
            { changedValue: undefined, path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Set undefined', () => {
        const obs = obsProxy({ test: 'hi' });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.set(undefined);
        expect(handler).toHaveBeenCalledWith(undefined, {
            changedValue: undefined,
            path: [],
            prevValue: { test: 'hi' },
        });
    });
    test('Deep object set undefined', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.test2.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: undefined } },
            { changedValue: undefined, path: ['test', 'test2'], prevValue: { test3: 'hi' } }
        );
    });
    test('Start null set to something', () => {
        const obs = obsProxy({ test: null });
        const handler = jest.fn();
        listenToObs(obs, handler);
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
        const obs = obsProxy({ test: undefined });
        const handler = jest.fn();
        listenToObs(obs, handler);
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
        const obs = obsProxy({ test: undefined });
        const handler = jest.fn();
        listenToObs(obs, handler);
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
});
describe('Arrays', () => {
    test('Array push', () => {
        const obs = obsProxy({ test: ['hi'] });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.push('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: ['hi', 'hello'] },
            { changedValue: ['hi', 'hello'], path: ['test'], prevValue: ['hi'] }
        );
    });
    test('Array set at index should fail on safe', () => {
        const obs = obsProxy({ test: ['hi'] });
        expect(() => {
            obs.test[1] = 'hello';
        }).toThrow();
    });
    test('Array set at index should succeed on unsafe', () => {
        const obs = obsProxy({ test: ['hi'] }, /*unsafe*/ true);
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test[1] = 'hello';
        expect(handler).toHaveBeenCalledWith(
            { test: ['hi', 'hello'] },
            { changedValue: ['hi', 'hello'], path: ['test'], prevValue: ['hi'] }
        );
    });
    test('Path to change is correct at every level ', () => {
        const obs = obsProxy({ test1: { test2: { test3: { test4: '' } } } });
        const handlerRoot = jest.fn();
        listenToObs(obs, handlerRoot);
        const handler1 = jest.fn();
        listenToObs(obs.test1, handler1);
        const handler2 = jest.fn();
        listenToObs(obs.test1.test2, handler2);
        const handler3 = jest.fn();
        listenToObs(obs.test1.test2.test3, handler3);
        const handler4 = jest.fn();
        listenToObs(obs.test1.test2.test3.test4, handler4);
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
});
describe('on functions', () => {
    test('onValue with prop', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        obs.val.on('equals', 20, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(20);
        expect(handler).toHaveBeenCalledWith(20);
    });
    test('onValue deep', () => {
        const obs = obsProxy({ test: { test2: '', test3: '' } });
        const handler = jest.fn();
        obs.test.test2.on('equals', 'hello', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hi');
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hello');
        expect(handler).toHaveBeenCalledWith('hello');
    });
    test('onTrue', () => {
        const obs = obsProxy({ val: false });
        const handler = jest.fn();
        obs.val.on('true', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalledWith(true);
    });
    test('onTrue starting true', () => {
        const obs = obsProxy({ val: true });
        const handler = jest.fn();
        obs.val.on('true', handler);
        expect(handler).toHaveBeenCalled();
        obs.val.set(false);
        expect(handler).toHaveBeenCalledTimes(1);
        obs.val.set(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with false', () => {
        const obs = obsProxy({ val: false });
        const handler = jest.fn();
        obs.val.on('hasValue', handler);
        expect(handler).toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    // TOOOBS
    // test('onHasValue with undefined', () => {
    //     const obs = obsProxy({ val: undefined });
    //     const handler = jest.fn();
    //     obs.val.on('hasValue', handler);
    //     expect(handler).not.toHaveBeenCalled();
    //     obs.val.set(true);
    //     expect(handler).toHaveBeenCalledWith(true);
    // });
});

describe('Map', () => {
    test('Map set', () => {
        const obs = obsProxy({ test: new Map() });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.set('key', 'hello');
        expect(handler).toHaveBeenCalledWith(
            { test: new Map([['key', 'hello']]) },
            { changedValue: new Map([['key', 'hello']]), path: ['test'], prevValue: new Map() }
        );
    });

    test('Map clear', () => {
        const obs = obsProxy({ test: new Map() });
        const handler = jest.fn();
        obs.test.set('key', 'hello');
        listenToObs(obs, handler);
        obs.test.clear();
        expect(handler).toHaveBeenCalledWith(
            { test: new Map() },
            { changedValue: new Map(), path: ['test'], prevValue: new Map([['key', 'hello']]) }
        );
    });

    test('Map delete', () => {
        const obs = obsProxy({ test: new Map() });
        const handler = jest.fn();
        obs.test.set('key', 'hello');
        listenToObs(obs, handler);
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
        const obs = obsProxy({ test: new WeakMap() });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.set(key, 'hello');
        expect(handler).toHaveBeenCalledWith(
            { test: new WeakMap([[key, 'hello']]) },
            // Note: WeakMap can't provide an accurate prevValue
            { changedValue: new WeakMap([[key, 'hello']]), path: ['test'], prevValue: new WeakMap() }
        );
    });

    test('WeakMap delete', () => {
        const obs = obsProxy({ test: new WeakMap() });
        const handler = jest.fn();
        obs.test.set(key, 'hello');
        listenToObs(obs, handler);
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
        const obs = obsProxy({ test: new Set() });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.add('testval');
        expect(handler).toHaveBeenCalledWith(
            { test: new Set(['testval']) },
            { changedValue: new Set(['testval']), path: ['test'], prevValue: new Set() }
        );
    });

    test('Set clear', () => {
        const obs = obsProxy({ test: new Set() });
        const handler = jest.fn();
        obs.test.add('testval');
        listenToObs(obs, handler);
        obs.test.clear();
        expect(handler).toHaveBeenCalledWith(
            { test: new Set() },
            { changedValue: new Set(), path: ['test'], prevValue: new Set(['testval']) }
        );
    });

    test('Set delete', () => {
        const obs = obsProxy({ test: new Set() });
        const handler = jest.fn();
        obs.test.add('testval');
        listenToObs(obs, handler);
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
        const obs = obsProxy({ test: new WeakSet() });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.add(key);
        expect(handler).toHaveBeenCalledWith(
            { test: new WeakSet([key]) },
            // Note: WeakSet can't provide an accurate prevValue
            { changedValue: new WeakSet([key]), path: ['test'], prevValue: new WeakSet() }
        );
    });

    test('WeakSet delete', () => {
        const obs = obsProxy({ test: new WeakSet() });
        const handler = jest.fn();
        obs.test.add(key);
        listenToObs(obs, handler);
        obs.test.delete(key);
        expect(handler).toHaveBeenCalledWith(
            { test: new WeakSet() },
            { changedValue: new WeakSet(), path: ['test'], prevValue: new WeakSet() }
        );
    });
});

describe('Computed', () => {
    // test('Basic computed', () => {
    //     const obs = obsProxy({ test: 10 });
    //     const obs2 = obsProxy({ test: 20 });
    //     const computed = obsProxyComputed([obs, obs2], (val1, val2) => ({ val: val1.test + val2.test }));

    //     expect(computed.get()).toEqual({ val: 30 });
    // });
    test('Multiple computed changes', () => {
        const obs = obsProxy({ test: 10 });
        const obs2 = obsProxy({ test: 20 });
        const computed = obsProxyComputed([obs, obs2], (val1, val2) => ({ val: val1.test + val2.test }));

        expect(computed.get()).toEqual({ val: 30 });

        const handler = jest.fn();
        listenToObs(computed, handler);

        obs.test.set(5);

        expect(handler).toHaveBeenCalledWith(
            { val: 25 },
            { changedValue: { val: 25 }, path: [], prevValue: { val: 30 } }
        );
        expect(computed.get()).toEqual({ val: 25 });

        obs.test.set(1);

        expect(handler).toHaveBeenCalledWith(
            { val: 21 },
            { changedValue: { val: 21 }, path: [], prevValue: { val: 25 } }
        );
        expect(computed.get()).toEqual({ val: 21 });
    });
});

describe('Deep changes keep listeners', () => {
    test('Deep set keeps listeners', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hello' } } });

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
        const obs = obsProxy({ test: { test2: { test3: 'hello' } } });

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
});
