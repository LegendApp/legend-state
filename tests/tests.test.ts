import { listenToObs, obsProxy, onHasValue, onTrue, onValue } from '../src';

describe('Basic', () => {
    test('Has value', () => {
        const obs = obsProxy({ val: 10 });
        expect(obs).toEqual({ val: 10 });
        expect(obs.value).toEqual({ val: 10 });
    });
    test('Primitive access', () => {
        const obs = obsProxy({ val: 10 });
        expect(obs.val).toEqual(10);
        expect(obs.value.val).toEqual(10);
    });
    test('modify value', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.value = { val: 20 };
        expect(obs).toEqual({ val: 20 });
        expect(obs.value).toEqual({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { changedValue: 20, path: ['val'], prevValue: 10 });
    });
    test('modify value deep', () => {
        const obs = obsProxy({ test: { test2: { test3: { test4: '' } } } });
        const handler = jest.fn();
        listenToObs(obs, handler);

        obs.test.test2.test3.test4 = 'hi';
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
    test('set function', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        listenToObs(obs, handler);

        const ret = obs.set({ val: 20 });
        expect(obs.value).toEqual({ val: 20 });
        expect(ret.value).toEqual({ val: 20 });
        expect(ret.set).not.toBeUndefined();
        // @ts-ignore
        expect(ret.value.set).toBeUndefined();
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { changedValue: 20, path: ['val'], prevValue: 10 });
    });
    test('set function deep', () => {
        const obs = obsProxy({ test: { test2: { test3: { test4: '' } } } });
        const handler = jest.fn();
        listenToObs(obs, handler);

        const ret = obs.test.test2.test3.set('test4', 'hi');
        expect(ret.value).toEqual({ test4: 'hi' });
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
    test('error on safe', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = obsProxy({ test: 'hi' }, true);
        expect(() => {
            // @ts-ignore This is meant to error
            obs.test.value = 'hello';
        }).toThrow();
        expect(obs.test).toEqual('hi');
        consoleErrorMock.mockRestore();
    });
    test('safe using set function', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = obsProxy({ test: 'hi' }, true);
        obs.set('test', 'hello');
        expect(consoleErrorMock).not.toHaveBeenCalled();
        expect(obs.test).toEqual('hello');

        consoleErrorMock.mockRestore();
    });
    test('modify value does not copy object', () => {
        const obs = obsProxy({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.value = newVal;
        expect(obs.test.value).toBe(newVal);
    });
    test('modify value retains old listeners', () => {
        const obs = obsProxy({ test: { test2: 'hi' } });
        const handler = jest.fn();
        listenToObs(obs.test, handler);
        const newVal = { test2: 'hello' };
        obs.test.value = newVal;
        expect(obs.test.value).toBe(newVal);
        expect(obs.value).toEqual({ test: newVal });
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
        expect(handler).not.toHaveBeenCalled();
        listenToObs(obs, handler);
        obs.value = { val: 20 };
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { changedValue: 20, path: ['val'], prevValue: 10 });
    });
    test('Primitive listener with key', () => {
        const obs = obsProxy({ val: 10 });
        const handler = jest.fn();
        listenToObs(obs, 'val', handler);
        obs.val = 20;
        expect(handler).toHaveBeenCalledWith(20, { changedValue: 20, path: ['val'], prevValue: 10 });
    });
    test('Non Primitive listener with key', () => {
        const obs = obsProxy({ val: { val2: 10 } });
        const handler = jest.fn();
        listenToObs(obs, 'val', handler);
        obs.val.val2 = 20;
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { changedValue: 20, path: ['val', 'val2'], prevValue: 10 });
    });
    test('Object listener', () => {
        const obs = obsProxy({ test: 'hi' });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test = 'hello';
        expect(handler).toHaveBeenCalledWith(
            { test: 'hello' },
            { changedValue: 'hello', path: ['test'], prevValue: 'hi' }
        );
    });
    test('Deep object listener', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.test2.test3 = 'hello';
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { changedValue: 'hello', path: ['test', 'test2', 'test3'], prevValue: 'hi' }
        );
    });
    test('Deep object set undefined', () => {
        const obs = obsProxy({ test: { test2: { test3: 'hi' } } });
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.test.test2 = undefined;
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: undefined } },
            { changedValue: undefined, path: ['test', 'test2'], prevValue: { test3: 'hi' } }
        );
    });
    test('Array', () => {
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
        obs.val = 20;
        expect(handler).toHaveBeenCalledWith(20);
    });
    test('onTrue', () => {
        const obs = obsProxy({ val: false });
        const handler = jest.fn();
        onTrue(obs, 'val', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val = true;
        expect(handler).toHaveBeenCalledWith(true);
    });
    test('onTrue starting true', () => {
        const obs = obsProxy({ val: true });
        const handler = jest.fn();
        onTrue(obs, 'val', handler);
        expect(handler).toHaveBeenCalled();
        obs.val = false;
        expect(handler).toHaveBeenCalledTimes(1);
        obs.val = true;
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with false', () => {
        const obs = obsProxy({ val: false });
        const handler = jest.fn();
        onHasValue(obs, 'val', handler);
        expect(handler).toHaveBeenCalled();
        obs.val = true;
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('onHasValue with undefined', () => {
        const obs = obsProxy({ val: undefined });
        const handler = jest.fn();
        onHasValue(obs, 'val', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val = true;
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
