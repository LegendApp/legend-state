import { observable2 } from '../src/observable2';

describe('Basic', () => {
    test('Set', () => {
        const obs = observable2({ test: { text: 't' } });
        obs.test.set({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set by key', () => {
        const obs = observable2({ test: { text: 't' } });
        obs.test.set('text', 't2');
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set child', () => {
        const obs = observable2({ test: { text: { text2: 't' } } });
        obs.test.text.set({ text2: 't2' });
        expect(obs).toEqual({ test: { text: { text2: 't2' } } });
    });
    test('Set at root', () => {
        const obs = observable2({ test: { text: 't' } });
        obs.set({ test: { text: 't2' } });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Prevent writes', () => {
        const obs = observable2({ test: { text: 't' } });
        expect(() => {
            // @ts-expect-error
            obs.test.text = 'hello';
        }).toThrow();
        expect(obs).toEqual({ test: { text: 't' } });
    });
    test('Primitive set', () => {
        const obs = observable2({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        obs.test.prop('text').set('t2');
        expect(obs.test.text).toEqual('t2');
    });
    test('Primitive listen', () => {
        const obs = observable2({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test.prop('text').on('change', handler);
        obs.on('change', handler2);
        obs.test.prop('text').set('t2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't');
        expect(handler2).toHaveBeenCalledWith({ test: { text: 't2' } }, { test: { text: 't' } });
    });
    test('Listen', () => {
        const obs = observable2({ test: { text: 't' }, arr: [] });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test.on('change', handler);
        obs.on('change', handler2);
        obs.test.set({ text: 't2' });
        expect(handler).toHaveBeenCalledWith({ text: 't2' }, { text: 't' });
        expect(handler2).toHaveBeenCalledWith({ test: { text: 't2' } }, { test: { text: 't' } });
    });
    test('Listen by key', () => {
        const obs = observable2({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        const handler2 = jest.fn();
        // @ts-ignore
        obs.test.on('text', 'change', handler);
        obs.on('change', handler2);
        obs.test.set('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't');
        expect(handler2).toHaveBeenCalledWith({ test: { text: 't2' } }, { test: { text: 't' } });
    });
});

describe('Array', () => {
    test('Basic array', () => {
        const obs = observable2({ arr: [] });
        expect(obs.arr).toEqual([]);

        obs.arr.set([1, 2, 3]);
        expect(obs.arr).toEqual([1, 2, 3]);
    });
});
