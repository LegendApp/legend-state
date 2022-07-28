import { observable2 } from '../src/observable2';

describe('Set', () => {
    test('Set', () => {
        const obs = observable2({ test: { text: 't' } });
        obs.test._set({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set by key', () => {
        const obs = observable2({ test: { text: 't' } });
        obs.test._set('text', 't2');
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set child', () => {
        const obs = observable2({ test: { text: { text2: 't' } } });
        obs.test.text._set({ text2: 't2' });
        expect(obs).toEqual({ test: { text: { text2: 't2' } } });
    });
    test('Set at root', () => {
        const obs = observable2({ test: { text: 't' } });
        obs._set({ test: { text: 't2' } });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Set value does not copy object', () => {
        const obs = observable2({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test._set(newVal);
        expect(obs.test).toBe(newVal);
    });
});
describe('Assign', () => {
    test('Assign', () => {
        const obs = observable2({ test: { text: 't' } });
        obs.test._assign({ text: 't2' });
        expect(obs).toEqual({ test: { text: 't2' } });
    });
    test('Assign more keys', () => {
        const obs = observable2<Record<string, any>>({ test: { text: 't' } });
        obs.test._assign({ text: 'tt', text2: 'tt2' });
        expect(obs).toEqual({ test: { text: 'tt', text2: 'tt2' } });
    });
});
describe('Listeners', () => {
    test('Listen', () => {
        const obs = observable2({ test: { text: 't' }, arr: [] });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.test._on('change', handler);
        obs._on('change', handler2);
        obs.test._set({ text: 't2' });
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
        const obs = observable2({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        // @ts-ignore
        obs.test._prop('text')._on('change', handler);
        obs.test._set('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
    });
    test('Listen by key', () => {
        const obs = observable2({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        const handler = jest.fn();
        // @ts-ignore
        obs.test._on('text', 'change', handler);
        obs.test._set('text', 't2');
        expect(obs.test.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
    });
    test('Listen deep', () => {
        const obs = observable2({ test: { test2: { test3: { text: 't' } } } });
        const handler = jest.fn();
        const handler2 = jest.fn();
        // @ts-ignore
        obs.test.test2.test3._on('text', 'change', handler);
        obs._on('change', handler2);
        obs.test.test2.test3._set('text', 't2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', { path: [], prevValue: 't', value: 't2' });
        expect(handler2).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't', value: 't2' }
        );
    });
    test('Listen calls multiple times', () => {
        const obs = observable2({ test: { test2: { test3: { text: 't' } } } });
        const handler = jest.fn();
        obs._on('change', handler);
        obs.test.test2.test3._set('text', 't2');
        expect(obs.test.test2.test3.text).toEqual('t2');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't', value: 't2' }
        );
        obs.test.test2.test3._set('text', 't3');
        expect(obs.test.test2.test3.text).toEqual('t3');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't3' } } } },
            { path: ['test', 'test2', 'test3', 'text'], prevValue: 't2', value: 't3' }
        );
    });
    test('Set calls and maintains deep listeners', () => {
        const obs = observable2({ test: { test2: 'hi' } });
        const handler = jest.fn();
        // @ts-ignore
        obs.test._on('test2', 'change', handler);

        obs.test._set({ test2: 'hello' });

        expect(handler).toHaveBeenCalledWith('hello', { path: [], prevValue: 'hi', value: 'hello' });

        obs.test._set({ test2: 'hi there' });

        expect(handler).toHaveBeenCalledWith('hi there', { path: [], prevValue: 'hello', value: 'hi there' });
    });
    test('Set on root calls deep listeners', () => {
        const obs = observable2({ test: { test2: 'hi' } });
        const handler = jest.fn();
        // @ts-ignore
        obs.test._on('test2', 'change', handler);

        obs._set({ test: { test2: 'hello' } });

        expect(handler).toHaveBeenCalledWith('hello', { path: [], prevValue: 'hi', value: 'hello' });
    });
});
describe('Safety', () => {
    test('Prevent writes', () => {
        const obs = observable2({ test: { text: 't' } });
        expect(() => {
            // @ts-expect-error
            obs.test.text = 'hello';
        }).toThrow();
    });
});
describe('Primitives', () => {
    test('Primitive set', () => {
        const obs = observable2({ test: { text: 't' } });
        expect(obs.test.text).toEqual('t');
        obs.test._prop('text')._set('t2');
        expect(obs.test.text).toEqual('t2');
    });
    test('Deep primitive access', () => {
        const obs = observable2({ val: { val2: { val3: 10 } } });
        expect(obs.val.val2.val3).toEqual(10);

        obs.val.val2._set('val3', 20);

        expect(obs.val.val2.val3).toEqual(20);
    });
    test('Primitive set not allowed', () => {
        const obs = observable2({ val: 10 });
        expect(obs.val).toBe(10);
        // @ts-expect-error
        obs.val._set(20);
        expect(obs.val).toEqual(10);
    });
    test('Primitive root not allowed', () => {
        // @ts-expect-error
        const obs = observable2(10);
    });
});

describe('Array', () => {
    test('Basic array', () => {
        const obs = observable2({ arr: [] });
        expect(obs.arr).toEqual([]);

        obs.arr._set([1, 2, 3]);
        expect(obs.arr).toEqual([1, 2, 3]);
    });
    test('Array functions', () => {
        const obs = observable2({ arr: [] });
        const handler = jest.fn();

        obs.arr._on('change', handler);
    });
    test('Array still has builtin functions', () => {
        const obs = observable2({ arr: [1, 2] });

        expect(obs.arr.map((a) => a)).toEqual([1, 2]);
    });
});

describe('Delete', () => {
    test('Delete key', () => {
        const obs = observable2({ test: { text: 't', text2: 't2' } });
        obs.test._delete('text2');
        expect(obs).toEqual({ test: { text: 't' } });
    });
    test('Delete self', () => {
        const obs = observable2({ test: { text: 't' }, test2: { text2: 't2' } });
        obs.test2._delete();
        expect(obs).toEqual({ test: { text: 't' } });
    });
});
