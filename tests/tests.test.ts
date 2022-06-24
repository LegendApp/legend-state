import { disposeListener, listenToObs, obsProxy, onHasValue, onTrue, onValue } from '../src';

describe('Basic', () => {
    test('Has value', () => {
        const obs = obsProxy({ val: 10 });
        expect(obs).toEqual({ val: 10 });
        expect(obs.get()).toEqual({ val: 10 });
    });
    test('Primitive access', () => {
        const obs = obsProxy({ val: 10 });
        expect(obs.val).toEqual(10);
        expect(obs.get().val).toEqual(10);
    });
    test('modify value', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        const listener1 = listenToObs(obs, handler);

        // Set by key
        obs.set('val', 20);
        expect(obs).toEqual({ val: 20 });
        expect(obs.get()).toEqual({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { changedValue: 20, path: ['val'], prevValue: 10 });

        disposeListener(listener1);

        const handle2 = jest.fn();
        listenToObs(obs, handle2);

        // Set whole object
        obs.set({ val: 30 });
        expect(obs).toEqual({ val: 30 });
        expect(obs.get()).toEqual({ val: 30 });
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
        expect(obs.test.test2.test3.test4).toEqual('hi');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { test4: 'hi' } } } },
            {
                changedValue: { test4: 'hi' },
                path: ['test', 'test2', 'test3'],
                prevValue: { test4: '' },
            }
        );

        obs.test.test2.test3.set('test4', 'hi2');
        expect(obs.test.test2.test3.test4).toEqual('hi2');
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

        const ret = obs.test.test2.test3.set('test4', 'hi');
        expect(ret).toEqual({ test4: 'hi' });
        expect(ret.get()).toEqual({ test4: 'hi' });
        expect(obs.test.test2.test3.test4).toEqual('hi');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { test4: 'hi' } } } },
            {
                changedValue: 'hi',
                path: ['test', 'test2', 'test3', 'test4'],
                prevValue: '',
            }
        );
    });
    test('unsafe', () => {
        const obs = obsProxy({ test: 'hi', test2: { test3: { test4: 'hi4' } } }, /*unsafe*/ true);
        obs.test = 'hello';
        obs.test2.test3 = { test4: 'hi5' };
        expect(obs).toEqual({ test: 'hello', test2: { test3: { test4: 'hi5' } } });
    });
    test('error on unsafe', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = obsProxy({ test: 'hi', test2: { test3: { test4: 'hi4' } } });
        expect(() => {
            // @ts-ignore This is meant to error
            obs.test = 'hello';
        });
        expect(() => {
            // @ts-ignore This is meant to error
            obs.test2.test3 = { test4: 'hi5' };
        }).toThrow();
        expect(obs.test).toEqual('hi');
        consoleErrorMock.mockRestore();
    });
    test('safe using set function', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = obsProxy({ test: 'hi' });
        obs.set('test', 'hello');
        expect(consoleErrorMock).not.toHaveBeenCalled();
        expect(obs.test).toEqual('hello');

        consoleErrorMock.mockRestore();
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
        expect(obs.test.get()).toBe(newVal);
        expect(obs).toEqual({ test: newVal });
        expect(handler).toHaveBeenCalledWith(newVal, {
            changedValue: { test2: 'hello' },
            path: ['test'],
            prevValue: { test2: 'hi' },
        });
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
    test('Primitive listener with key', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        listenToObs(obs, 'val', handler);
        obs.set('val', 20);
        expect(handler).toHaveBeenCalledWith(20, { changedValue: 20, path: ['val'], prevValue: 10 });
    });
    test('Non Primitive listener with key', () => {
        const obs = obsProxy({ val: { val2: 10 } });
        const handler = jest.fn();
        listenToObs(obs, 'val', handler);
        obs.val.set('val2', 20);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { changedValue: 20, path: ['val', 'val2'], prevValue: 10 });
    });
    test('Object listener', () => {
        const obs = obsProxy({ test: 'hi' });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.set('test', 'hello');
        expect(handler).toHaveBeenCalledWith(
            { test: 'hello' },
            { changedValue: 'hello', path: ['test'], prevValue: 'hi' }
        );
    });
    test('Deep object listener', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.test2.set('test3', 'hello');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { changedValue: 'hello', path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set undefined', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.set('test2', undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: undefined } },
            { changedValue: undefined, path: ['test', 'test2'], prevValue: { test3: 'hi' } }
        );
    });
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
    test('onValue with prop', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        onValue(obs, 'val', 20, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.set('val', 20);
        expect(handler).toHaveBeenCalledWith(20);
    });
    test('onTrue', () => {
        const obs = obsProxy({ val: false });
        const handler = jest.fn();
        onTrue(obs, 'val', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.set('val', true);
        expect(handler).toHaveBeenCalledWith(true);
    });
    test('onTrue starting true', () => {
        const obs = obsProxy({ val: true });
        const handler = jest.fn();
        onTrue(obs, 'val', handler);
        expect(handler).toHaveBeenCalled();
        obs.set('val', false);
        expect(handler).toHaveBeenCalledTimes(1);
        obs.set('val', true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with false', () => {
        const obs = obsProxy({ val: false });
        const handler = jest.fn();
        onHasValue(obs, 'val', handler);
        expect(handler).toHaveBeenCalled();
        obs.set('val', true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with undefined', () => {
        const obs = obsProxy({ val: undefined });
        const handler = jest.fn();
        onHasValue(obs, 'val', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.set('val', true);
        expect(handler).toHaveBeenCalledWith(true);
    });
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
