import { listenToObs, obsProxy } from '../src';

describe('Basic', () => {
    test('Has value', () => {
        const obs = obsProxy(10);
        expect(obs.value).toEqual(10);
    });
    test('set value', () => {
        const obs = obsProxy<number>(10);
        obs.value = 20;
        expect(obs.value).toEqual(20);
    });
    test('set function', () => {
        const obs = obsProxy<number>(10);
        const ret = obs.set(20);
        expect(obs.value).toEqual(20);
        expect(ret.value).toEqual(20);
        expect(ret.set).not.toBeUndefined();
    });
    test('require set function', () => {
        const obs = obsProxy<number>(10);
        const ret = obs.set(20);
        expect(obs.value).toEqual(20);
        expect(ret.value).toEqual(20);
        expect(ret.set).not.toBeUndefined();
    });
    test('require set function', () => {
        const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
        const obs = obsProxy({ test: 'hi' }, true);
        //   @ts-ignore
        obs.test = 'hello';
        expect(consoleErrorMock).toHaveBeenCalled();
        consoleErrorMock.mockRestore();
    });
});

describe('Listeners', () => {
    test('Primitive listener', () => {
        const obs = obsProxy<number>(10);
        const handler = jest.fn();
        listenToObs(obs, handler);
        obs.value = 20;
        expect(handler).toHaveBeenCalledWith(20, { changedValue: 20, path: [], prevValue: 10 });
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
});
