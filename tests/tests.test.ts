import { obsProxy } from '../src';

describe('Basic', () => {
    test('Has value', () => {
        const obs = obsProxy(10);
        expect(obs.value).toEqual(10);
    })

    test("set value", () => {
      const obs = obsProxy<number>(10);
      obs.value = 20;
      expect(obs.value).toEqual(20);
    });

    test("set function", () => {
      const obs = obsProxy<number>(10);
      const ret = obs.set(20);
      expect(obs.value).toEqual(20);
      expect(ret.value).toEqual(20);
      expect(ret.set).not.toBeUndefined();
    });
})