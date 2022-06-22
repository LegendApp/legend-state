import { obsProxy } from '../src';

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

describe('Listeners', () => {});
