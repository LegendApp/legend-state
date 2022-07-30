import { observableComputed3 } from '../src/observableComputed3';
import { observable3 } from '../src/observable3';

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
        obs.test._.onChangeShallow(handler);
        obs.test.test2._.set('test3', 'hello');
        expect(handler).not.toHaveBeenCalled();
        obs.test._.set({ test2: { test3: 'hello' } });
        expect(handler).toHaveBeenCalled();
        obs.test._.assign({ test3: 'hello' } as any);
        // expect(handler).toHaveBeenCalledTimes(1);
    });
    // test('Shallow array swap', () => {
    //     const obs = observable3({
    //         test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }, { text: 6 }],
    //     });
    //     const handler = jest.fn();
    //     const handler2 = jest.fn();
    //     obs.test._.onChangeShallow(handler);
    //     obs.test[1]._.onChange(handler2);
    //     let tmp = obs.test[1];
    //     obs.test._.set(1, obs.test[4]);
    //     obs.test._.set(4, tmp);
    //     expect(obs.test).toEqual([{ text: 1 }, { text: 5 }, { text: 3 }, { text: 4 }, { text: 2 }, { text: 6 }]);
    //     expect(handler).toHaveBeenCalledTimes(0);
    //     expect(handler2).toHaveBeenCalledTimes(1);
    //     // tmp = obs.test[1];
    //     // obs.test._.set(1, obs.test[4]);
    //     // obs.test._.set(4, tmp);
    //     // expect(obs.test).toEqual([{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }, { text: 6 }]);
    //     // expect(handler).toHaveBeenCalledTimes(4);
    //     // // @ts-ignore
    //     // obs.test[5]._.set('text', 66);
    //     // expect(obs.test).toEqual([{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }, { text: 66 }]);
    //     // expect(handler).toHaveBeenCalledTimes(4);
    // });
});
describe('Safety', () => {
    test('Prevent writes', () => {
        const obs = observable3({ test: { text: 't' } });
        // @ts-expect-error
        obs.test.text = 'hello';
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
// describe('Shallow', () => {
//     test('Shallow 1', () => {
//         const obs = observable3({ val: false } as { val: boolean; val2?: number });
//         const handler = jest.fn();
//         obs._.onChangeShallow(handler);
//         obs._.set('val', true);
//         expect(handler).not.toHaveBeenCalled();

//         obs._.set('val2', 10);

//         expect(handler).toHaveBeenCalledTimes(1);
//     });
//     test('Shallow set primitive', () => {
//         const obs = observable3({ val: false } as { val: boolean; val2?: number });
//         const handler = jest.fn();
//         obs._.onChangeShallow(handler);
//         obs._.set('val', true);
//         expect(handler).not.toHaveBeenCalled();

//         obs._.set('val2', 10);

//         expect(handler).toHaveBeenCalledTimes(1);
//     });
//     test('Shallow deep object', () => {
//         const obs = observable3({ val: { val2: { val3: 'hi' } } });
//         const handler = jest.fn();
//         obs._.onChangeShallow(handler);
//         obs.val.val2._.set('val3', 'hello');
//         expect(handler).not.toHaveBeenCalled();
//     });
//     test('Shallow array', () => {
//         const obs = observable3({ data: [], selected: 0 });
//         const handler = jest.fn();
//         obs.data._.onChangeShallow(handler);

//         obs.data._.set([{ text: 1 }, { text: 2 }]);

//         expect(handler).toHaveBeenCalledTimes(1);

//         obs.data[0]._.set({ text: 11 });

//         expect(handler).toHaveBeenCalledTimes(1);
//     });
// });
describe('Computed', () => {
    test('Basic computed', () => {
        const obs = observable3({ test: 10, test2: 20 });
        const computed = observableComputed3([obs._.prop('test'), obs._.prop('test2')], (test, test2) => test + test2);
        expect(computed.value).toEqual(30);
    });
    test('Multiple computed changes', () => {
        const obs = observable3({ test: 10, test2: 20 });
        const computed = observableComputed3([obs._.prop('test'), obs._.prop('test2')], (test, test2) => test + test2);
        expect(computed.value).toEqual(30);

        const handler = jest.fn();
        computed._.onChange('value', handler);

        obs._.set('test', 5);

        expect(handler).toHaveBeenCalledWith(25, { value: 25, path: [], prevValue: 30 });
        expect(computed.value).toEqual(25);

        obs._.set('test', 1);

        expect(handler).toHaveBeenCalledWith(21, { value: 21, path: [], prevValue: 25 });
        expect(computed.value).toEqual(21);
    });
    test('Cannot directly set a computed', () => {
        const obs = observable3({ test: 10, test2: 20 });
        const computed = observableComputed3([obs._.prop('test'), obs._.prop('test2')], (test, test2) => test + test2);

        // @ts-expect-error
        computed._.set(40);

        expect(computed.value).toEqual(30);

        // @ts-expect-error
        computed._.delete();

        expect(computed.value).toEqual(30);

        // @ts-expect-error
        computed._.assign({ text: 'hi' });

        expect(computed.value).toEqual(30);
    });
});
