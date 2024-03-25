/* eslint-disable @typescript-eslint/no-empty-function */
import { batch, beginBatch, endBatch } from '../src/batching';
import { computed } from '../src/computed';
import { configureLegendState } from '../src/config';
import '../src/config/enableDirectAccess';
import { enableDirectAccess } from '../src/config/enableDirectAccess';
import { enableDirectPeek } from '../src/config/enableDirectPeek';
import { event } from '../src/event';
import { getNodeValue, optimized, symbolGetNode } from '../src/globals';
import { isEvent, isObservable, lockObservable, opaqueObject, setAtPath } from '../src/helpers';
import { observable, observablePrimitive } from '../src/observable';
import { Change, NodeValue, ObservableReadable, TrackingType } from '../src/observableInterfaces';
import { observe } from '../src/observe';
import { when } from '../src/when';

enableDirectAccess();
enableDirectPeek();

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

let spiedConsole: jest.SpyInstance;

beforeEach(() => {
    jest.clearAllMocks();
    spiedConsole = jest.spyOn(global.console, 'error').mockImplementation(() => {});
});
afterAll(() => {
    spiedConsole.mockRestore();
});

function expectChangeHandler<T>(obs: ObservableReadable<T>, track?: TrackingType) {
    const ret = jest.fn();

    function handler({ value, getPrevious, changes }: { value: any; getPrevious: () => any; changes: Change[] }) {
        const prev = getPrevious();

        ret(value, prev, changes);
    }

    obs.onChange(handler, { trackingType: track });

    return ret;
}

describe('Set', () => {
    test('Set', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.set({ text: 't2' });
        expect(obs.test.get()).toEqual({ text: 't2' });
        expect(obs.get()).toEqual({ test: { text: 't2' } });
    });
    test('Set primitive', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.text.set('t2');
        expect(obs.get()).toEqual({ test: { text: 't2' } });
    });
    test('Set is bound', () => {
        const obs = observable({ test: { text: 't' } });
        const setter = obs.test.text.set;
        setter('t2');
        expect(obs.get()).toEqual({ test: { text: 't2' } });
    });
    test('Set child', () => {
        const obs = observable({ test: { text: { text2: 't' } } });
        obs.test.text.set({ text2: 't2' });
        expect(obs.get()).toEqual({ test: { text: { text2: 't2' } } });
    });
    test('Set in array', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        obs.arr.set([{ text: 'hi2' }]);
        expect(obs.arr.length).toEqual(1);

        expect(obs.arr.get()).toEqual([{ text: 'hi2' }]);
        expect(obs.arr[0].text.get()).toEqual('hi2');
        obs.arr[0].text.set('hi3');
        expect(obs.arr[0].text.get()).toEqual('hi3');
        expect(obs.arr.map((a) => a.get())).toEqual([{ text: 'hi3' }]);
    });
    test('Set at root', () => {
        const obs = observable({ test: { text: 't' } });
        obs.set({ test: { text: 't2' } });
        expect(obs.get()).toEqual({ test: { text: 't2' } });
    });
    test('Set empty object at root', () => {
        const obs = observable({ test: { text: 't' } } as Record<string, any>);
        obs.set({});
        expect(obs.get()).toEqual({});
    });
    test('Set at root deletes other properties', () => {
        const obs = observable({ test: { text: 't' }, test2: 'hello' } as { test: { text: string }; test2?: string });
        obs.set({ test: { text: 't2' } });
        expect(obs.get()).toEqual({ test: { text: 't2' } });
    });
    test('Set array at root', () => {
        const obs = observable([1, 2, 3]);
        obs.set([1, 2]);
        expect(obs.get()).toEqual([1, 2]);
    });
    test('Set value does not copy object', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toBe(newVal);
    });
    test('Multiple sets does not cleanup existing nodes', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });

        const handler = expectChangeHandler(obs.arr);

        obs.arr.set([{ text: 'hi2' }]);

        expect(handler).toHaveBeenCalledWith(
            [{ text: 'hi2' }],
            [{ text: 'hi' }],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [{ text: 'hi2' }],
                    prevAtPath: [{ text: 'hi' }],
                },
            ],
        );

        const setVal = obs.arr.set([{ text: 'hello' }]);
        expect(setVal.get()).toEqual([{ text: 'hello' }]);

        expect(obs.arr.get()).toEqual([{ text: 'hello' }]);

        expect(handler).toHaveBeenCalledWith(
            [{ text: 'hello' }],
            [{ text: 'hi2' }],
            [{ path: [], pathTypes: [], valueAtPath: [{ text: 'hello' }], prevAtPath: [{ text: 'hi2' }] }],
        );
    });
    test('Assign with functions', () => {
        const obs = observable({} as { test: () => string });
        obs.assign({ test: () => 'hi' });
        expect(obs.test()).toEqual('hi');
    });
    test('Set with function', () => {
        const obs = observable({ test: { num: 1 } });
        obs.test.num.set((n) => n + 1);
        expect(obs.test.get()).toEqual({ num: 2 });
    });
    test('Set prop with function', () => {
        const obs = observable({ test: { num: 1 } });
        obs.test.num.set((n) => n + 1);
        expect(obs.test.get()).toEqual({ num: 2 });
    });
    test('Increment from 0', () => {
        const store = observable({
            legend: {
                count: 0,
            },
        });

        let seen: number | undefined = undefined;

        observe(() => {
            seen = store.legend.count.get();
        });

        expect(seen).toEqual(0);

        store.legend.count.set((a) => a + 1);

        expect(seen).toEqual(1);
    });
    // test("Set with child that's an observable", () => {
    //     const obsOther = observable({ a: { b: 'hi' } });
    //     const obs = observable({ test: { t: { text2: 't' } } } as Record<string, any>);
    //     obs.test.set({ t: obsOther });
    //     expect(obs.get()).toEqual({ test: { t: { a: { b: 'hi' } } } });
    //     obs.test.set({ t: { tt: obsOther.a } });
    //     expect(obs.get()).toEqual({ test: { t: { tt: { b: 'hi' } } } });
    //     expect(obs.test.t.tt.get()).toEqual({ b: 'hi' });
    // });
    test('empty string as key', () => {
        const obs = observable({ '': 'test' });
        expect(obs[''].get()).toBe('test');
    });
    test('Setting an empty object notifies', () => {
        const obs = observable({ test: undefined as object | undefined });
        const handler = expectChangeHandler(obs.test);
        obs.test.set({});
        expect(handler).toHaveBeenCalledWith({}, undefined, [
            { path: [], pathTypes: [], valueAtPath: {}, prevAtPath: undefined },
        ]);
    });
    test('Setting undefined to null notifies', () => {
        const obs = observable({ test: undefined });
        const handler = expectChangeHandler(obs.test);
        obs.test.set(null);
        expect(handler).toHaveBeenCalledWith(null, undefined, [
            { path: [], pathTypes: [], valueAtPath: null, prevAtPath: undefined },
        ]);
    });
    test('Set with function does not overwrite it', () => {
        const obs = observable({ test: 1 });
        obs.test.set((v) => v + 1);
        obs.test.set((v) => v + 1);
    });
});
describe('Assign', () => {
    test('Assign', () => {
        const obs = observable({ test: { text: 't' } });
        obs.test.assign({ text: 't2' });
        expect(obs.get()).toEqual({ test: { text: 't2' } });
    });
    test('Assign more keys', () => {
        const obs = observable<Record<string, any>>({ test: { text: 't' } });
        obs.test.assign({ text: 'tt', text2: 'tt2' });
        expect(obs.get()).toEqual({ test: { text: 'tt', text2: 'tt2' } });
    });
});
describe('Listeners', () => {
    test('Listen', () => {
        const obs = observable({ test: { text: 't' }, arr: [] });
        const handler = expectChangeHandler(obs.test);
        const handler2 = expectChangeHandler(obs);
        obs.test.set({ text: 't2' });
        expect(handler).toHaveBeenCalledWith({ text: 't2' }, { text: 't' }, [
            { path: [], pathTypes: [], valueAtPath: { text: 't2' }, prevAtPath: { text: 't' } },
        ]);
        expect(handler2).toHaveBeenCalledWith({ test: { text: 't2' }, arr: [] }, { test: { text: 't' }, arr: [] }, [
            { path: ['test'], pathTypes: ['object'], valueAtPath: { text: 't2' }, prevAtPath: { text: 't' } },
        ]);
    });
    test('Listen by ref', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text.get()).toEqual('t');
        const handler = expectChangeHandler(obs.test.text);
        obs.test.text.set('t2');
        expect(obs.test.text.get()).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't', [
            { path: [], pathTypes: [], valueAtPath: 't2', prevAtPath: 't' },
        ]);
    });
    test('Listen by key', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text.get()).toEqual('t');
        const handler = expectChangeHandler(obs.test.text);
        obs.test.text.set('t2');
        expect(obs.test.text.get()).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't', [
            { path: [], pathTypes: [], valueAtPath: 't2', prevAtPath: 't' },
        ]);
    });
    test('Listen deep', () => {
        const obs = observable({ test: { test2: { test3: { text: 't' } } } });
        const handler = expectChangeHandler(obs.test.test2.test3.text);
        const handler2 = expectChangeHandler(obs);
        obs.test.test2.test3.text.set('t2');
        expect(obs.test.test2.test3.text.get()).toEqual('t2');
        expect(handler).toHaveBeenCalledWith('t2', 't', [
            { path: [], pathTypes: [], valueAtPath: 't2', prevAtPath: 't' },
        ]);
        expect(handler2).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { test: { test2: { test3: { text: 't' } } } },
            [
                {
                    path: ['test', 'test2', 'test3', 'text'],
                    pathTypes: ['object', 'object', 'object', 'object'],
                    valueAtPath: 't2',
                    prevAtPath: 't',
                },
            ],
        );
    });
    test('Listen calls multiple times', () => {
        const obs = observable({ test: { test2: { test3: { text: 't' } } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.test3.text.set('t2');
        expect(obs.test.test2.test3.text.get()).toEqual('t2');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't2' } } } },
            { test: { test2: { test3: { text: 't' } } } },
            [
                {
                    path: ['test', 'test2', 'test3', 'text'],
                    pathTypes: ['object', 'object', 'object', 'object'],
                    valueAtPath: 't2',
                    prevAtPath: 't',
                },
            ],
        );
        obs.test.test2.test3.text.set('t3');
        expect(obs.test.test2.test3.text.get()).toEqual('t3');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: { text: 't3' } } } },
            { test: { test2: { test3: { text: 't2' } } } },
            [
                {
                    path: ['test', 'test2', 'test3', 'text'],
                    pathTypes: ['object', 'object', 'object', 'object'],
                    valueAtPath: 't3',
                    prevAtPath: 't2',
                },
            ],
        );
    });
    test('Set calls and maintains deep listeners', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const handler = expectChangeHandler(obs.test.test2);
        obs.test.set({ test2: 'hello' });
        expect(handler).toHaveBeenCalledWith('hello', 'hi', [
            { path: [], pathTypes: [], valueAtPath: 'hello', prevAtPath: 'hi' },
        ]);
        obs.test.set({ test2: 'hi there' });
        expect(obs.test.test2.get()).toEqual('hi there');
        expect(handler).toHaveBeenCalledWith('hi there', 'hello', [
            { path: [], pathTypes: [], valueAtPath: 'hi there', prevAtPath: 'hello' },
        ]);
    });
    test('Set on root calls deep listeners', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const handler = expectChangeHandler(obs.test.test2);
        obs.set({ test: { test2: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', 'hi', [
            { path: [], pathTypes: [], valueAtPath: 'hello', prevAtPath: 'hi' },
        ]);
    });
    test('Shallow listener', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });

        const handler = expectChangeHandler(obs.test, true);
        const handler2 = expectChangeHandler(obs, true);

        obs.test.test2.test3.set('hello');
        expect(handler).not.toHaveBeenCalled();
        obs.test.set({ test2: { test3: 'hello' } });
        expect(handler).toHaveBeenCalledTimes(0);
        obs.test.set({ test5: 'hi' } as any);
        expect(handler).toHaveBeenCalledTimes(1);
        // Assign adding a new property does notify
        obs.test.assign({ test4: 'hello' } as any);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler2).toHaveBeenCalledTimes(0);
    });
    test('Listener called for each change', () => {
        const obs = observable({ test: { val: 10 } });
        const handler = expectChangeHandler(obs.test);
        expect(handler).not.toHaveBeenCalled();
        obs.test.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { val: 10 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 20 }, prevAtPath: { val: 10 } },
        ]);
        obs.test.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { val: 20 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 21 }, prevAtPath: { val: 20 } },
        ]);
        obs.test.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { val: 21 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 22 }, prevAtPath: { val: 21 } },
        ]);
        obs.test.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { val: 22 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 23 }, prevAtPath: { val: 22 } },
        ]);
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener called for each change at root', () => {
        const obs = observable({ val: 10 });
        const handler = expectChangeHandler(obs);
        expect(handler).not.toHaveBeenCalled();
        obs.set({ val: 20 });
        expect(handler).toHaveBeenCalledWith({ val: 20 }, { val: 10 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 20 }, prevAtPath: { val: 10 } },
        ]);
        obs.set({ val: 21 });
        expect(handler).toHaveBeenCalledWith({ val: 21 }, { val: 20 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 21 }, prevAtPath: { val: 20 } },
        ]);
        obs.set({ val: 22 });
        expect(handler).toHaveBeenCalledWith({ val: 22 }, { val: 21 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 22 }, prevAtPath: { val: 21 } },
        ]);
        obs.set({ val: 23 });
        expect(handler).toHaveBeenCalledWith({ val: 23 }, { val: 22 }, [
            { path: [], pathTypes: [], valueAtPath: { val: 23 }, prevAtPath: { val: 22 } },
        ]);
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Listener with key fires only for key', () => {
        const obs = observable({ val: { val2: 10 }, val3: 'hello' });
        const handler = expectChangeHandler(obs.val);
        obs.val.val2.set(20);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ val2: 20 }, { val2: 10 }, [
            { path: ['val2'], pathTypes: ['object'], valueAtPath: 20, prevAtPath: 10 },
        ]);
        obs.val3.set('hihi');
        obs.val3.set('hello again');
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Object listener', () => {
        const obs = observable({ test: 'hi' });
        const handler = expectChangeHandler(obs);
        obs.test.set('hello');
        expect(handler).toHaveBeenCalledWith({ test: 'hello' }, { test: 'hi' }, [
            { path: ['test'], pathTypes: ['object'], valueAtPath: 'hello', prevAtPath: 'hi' },
        ]);
    });
    test('Deep object listener', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.test3.set('hello');
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: 'hello' } } },
            { test: { test2: { test3: 'hi' } } },
            [
                {
                    path: ['test', 'test2', 'test3'],
                    pathTypes: ['object', 'object', 'object'],
                    valueAtPath: 'hello',
                    prevAtPath: 'hi',
                },
            ],
        );
    });
    test('Deep object set primitive undefined', () => {
        interface Data {
            test: {
                test2: {
                    test3: string | undefined; // TODO: Make it work as an optional property
                };
            };
        }
        const obs = observable<Data>({ test: { test2: { test3: 'hi' } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.test3.set(undefined);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: { test3: undefined } } },
            { test: { test2: { test3: 'hi' } } },
            [
                {
                    path: ['test', 'test2', 'test3'],
                    pathTypes: ['object', 'object', 'object'],
                    valueAtPath: undefined,
                    prevAtPath: 'hi',
                },
            ],
        );
    });
    test('Deep object set undefined', () => {
        interface Data {
            test: {
                test2:
                    | {
                          test3: string;
                      }
                    | undefined; // TODO: Make it work as an optional property
            };
        }
        const obs = observable<Data>({ test: { test2: { test3: 'hi' } } });
        const handler = expectChangeHandler(obs);
        obs.test.test2.set(undefined);
        expect(handler).toHaveBeenCalledWith({ test: { test2: undefined } }, { test: { test2: { test3: 'hi' } } }, [
            {
                path: ['test', 'test2'],
                pathTypes: ['object', 'object'],
                valueAtPath: undefined,
                prevAtPath: { test3: 'hi' },
            },
        ]);
    });
    test('Start null set to something', () => {
        interface Data {
            test: null | Record<string, string>;
        }
        const obs = observable<Data>({ test: null });
        const handler = expectChangeHandler(obs);
        obs.test.set({ test2: 'hi' });
        expect(handler).toHaveBeenCalledWith({ test: { test2: 'hi' } }, { test: null }, [
            {
                path: ['test'],
                pathTypes: ['object'],
                valueAtPath: {
                    test2: 'hi',
                },
                prevAtPath: null,
            },
        ]);
    });
    test('Start 0 set to null', () => {
        const obs = observable(0);
        const handler = expectChangeHandler(obs);
        obs.set(null);
        expect(handler).toHaveBeenCalledWith(null, 0, [
            {
                path: [],
                pathTypes: [],
                valueAtPath: null,
                prevAtPath: 0,
            },
        ]);
        expect(obs.peek()).toEqual(null);
    });
    test('Start undefined set to something', () => {
        interface Data {
            test: undefined | Record<string, string>;
        }
        const obs = observable<Data>({ test: undefined });
        const handler = expectChangeHandler(obs);
        obs.test.set({ test2: 'hi' });
        expect(handler).toHaveBeenCalledWith({ test: { test2: 'hi' } }, { test: undefined }, [
            { path: ['test'], pathTypes: ['object'], valueAtPath: { test2: 'hi' }, prevAtPath: undefined },
        ]);
    });
    test('Start undefined assign something', () => {
        interface Data {
            test?: undefined | { test2: string };
        }
        const obs = observable<Data>({});
        const handler = expectChangeHandler(obs);

        obs.test.assign({ test2: 'hi' });

        // TODO: The previous value here is not totally correct because it filled out the path to make set work
        expect(handler).toHaveBeenCalledWith({ test: { test2: 'hi' } }, { test: { test2: undefined } }, [
            { path: ['test', 'test2'], pathTypes: ['object', 'object'], valueAtPath: 'hi', prevAtPath: undefined },
        ]);
    });
    test('Set with object should only fire listeners once', () => {
        interface Data {
            test: undefined | Record<string, string>;
        }
        const obs = observable<Data>({ test: undefined });
        const handler = expectChangeHandler(obs);
        obs.test.set({ test2: 'hi', test3: 'hi3', test4: 'hi4' });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { test: { test2: 'hi', test3: 'hi3', test4: 'hi4' } },
            { test: undefined },
            [
                {
                    path: ['test'],
                    pathTypes: ['object'],
                    valueAtPath: { test2: 'hi', test3: 'hi3', test4: 'hi4' },
                    prevAtPath: undefined,
                },
            ],
        );
    });
    test('Listener promises', async () => {
        const obs = observable({ test: 'hi' });
        const promise = when(() => obs.test.get() === 'hi2');
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
        const handlerRoot = expectChangeHandler(obs);
        const handler1 = expectChangeHandler(obs.test1);
        const handler2 = expectChangeHandler(obs.test1.test2);
        const handler3 = expectChangeHandler(obs.test1.test2.test3);
        const handler4 = expectChangeHandler(obs.test1.test2.test3.test4);
        obs.test1.test2.test3.test4.set('hi');
        expect(handlerRoot).toHaveBeenCalledWith(
            { test1: { test2: { test3: { test4: 'hi' } } } },
            { test1: { test2: { test3: { test4: '' } } } },
            [
                {
                    path: ['test1', 'test2', 'test3', 'test4'],
                    pathTypes: ['object', 'object', 'object', 'object'],
                    valueAtPath: 'hi',
                    prevAtPath: '',
                },
            ],
        );
        expect(handler1).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi' } } },
            { test2: { test3: { test4: '' } } },
            [
                {
                    path: ['test2', 'test3', 'test4'],
                    pathTypes: ['object', 'object', 'object'],
                    valueAtPath: 'hi',
                    prevAtPath: '',
                },
            ],
        );
        expect(handler2).toHaveBeenCalledWith({ test3: { test4: 'hi' } }, { test3: { test4: '' } }, [
            {
                path: ['test3', 'test4'],
                pathTypes: ['object', 'object'],
                valueAtPath: 'hi',
                prevAtPath: '',
            },
        ]);
        expect(handler3).toHaveBeenCalledWith({ test4: 'hi' }, { test4: '' }, [
            { path: ['test4'], pathTypes: ['object'], valueAtPath: 'hi', prevAtPath: '' },
        ]);
        expect(handler4).toHaveBeenCalledWith('hi', '', [
            { path: [], pathTypes: [], valueAtPath: 'hi', prevAtPath: '' },
        ]);
    });
    test('Set with deep listener', () => {
        const obs = observable({ obj: { test: 'hi' } });
        const handler = expectChangeHandler(obs.obj.test);
        obs.set({ obj: { test: 'hello' } });
        expect(handler).toHaveBeenCalledWith('hello', 'hi', [
            { path: [], pathTypes: [], valueAtPath: 'hello', prevAtPath: 'hi' },
        ]);
    });
    test('Set undefined deep with deep listener', () => {
        interface Data {
            obj: {
                test: string | undefined;
            };
        }
        const obs = observable<Data>({ obj: { test: 'hi' } });
        const handler = expectChangeHandler(obs.obj.test);
        obs.obj.test.set(undefined);
        expect(handler).toHaveBeenCalledWith(undefined, 'hi', [
            { path: [], pathTypes: [], valueAtPath: undefined, prevAtPath: 'hi' },
        ]);
    });
    test('Modify value does not copy object', () => {
        const obs = observable({ test: { test2: 'hi' } });
        const newVal = { test2: 'hello' };
        obs.test.set(newVal);
        expect(obs.test.get()).toBe(newVal);
    });
    test('set returns correct value', () => {
        const obs = observable({ test: '' });
        const ret = obs.set({ test: 'hello' });
        expect(ret.get()).toEqual({ test: 'hello' });
        const ret2 = obs.test.set('hello');
        expect(ret2.get()).toEqual('hello');
        expect(obs.test.get()).toEqual('hello');
        const ret3 = obs.assign({ test: 'hello2' });
        expect(obs.test.get()).toEqual('hello2');
        expect(ret3.get()).toEqual({ test: 'hello2' });
        expect(obs.get()).toEqual({ test: 'hello2' });
    });
    test('Set number key', () => {
        const obs = observable({ test: {} as Record<number, string> });
        const handler = expectChangeHandler(obs.test);
        obs.test[1].set('hi');
        expect(handler).toHaveBeenCalledWith({ '1': 'hi' }, { '1': undefined }, [
            { path: ['1'], pathTypes: ['object'], valueAtPath: 'hi', prevAtPath: undefined },
        ]);
    });
    test('Set number key multiple times', () => {
        const obs = observable({ test: { t: {} as Record<number, any> } });
        const handler = expectChangeHandler(obs.test);
        obs.test.t[1000].set({ test1: { text: ['hi'] } });
        expect(obs.get()).toEqual({
            test: {
                t: {
                    '1000': {
                        test1: { text: ['hi'] },
                    },
                },
            },
        });
        expect(handler).toHaveBeenCalledWith({ t: { 1000: { test1: { text: ['hi'] } } } }, { t: { 1000: undefined } }, [
            {
                path: ['t', '1000'],
                pathTypes: ['object', 'object'],
                valueAtPath: { test1: { text: ['hi'] } },
                prevAtPath: undefined,
            },
        ]);
        expect(Object.keys(obs.test.t[1000])).toEqual(['test1']);
        obs.test.t[1000].set({ test1: { text: ['hi'] }, test2: { text: ['hi2'] } });
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
        expect(Object.keys(obs.test.t['1000'])).toEqual(['test1', 'test2']);
        expect(Object.keys(obs.test.t['1000'])).toEqual(['test1', 'test2']);
        expect(Object.keys(obs.test.t[1000])).toEqual(['test1', 'test2']);
        expect(obs.test.t.get()).toEqual({
            1000: {
                test1: { text: ['hi'] },
                test2: { text: ['hi2'] },
            },
        });
        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } } } },
            { t: { 1000: { test1: { text: ['hi'] } } } },
            [
                {
                    path: ['t', '1000'],
                    pathTypes: ['object', 'object'],
                    valueAtPath: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
                    prevAtPath: { test1: { text: ['hi'] } },
                },
            ],
        );
        obs.test.t[1000].set({ test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } });
        expect(obs.test.t.get()).toEqual({
            1000: {
                test1: { text: ['hiz'], text2: 'hiz2' },
                test2: { text: ['hi2'] },
            },
        });
        expect(handler).toHaveBeenCalledWith(
            { t: { 1000: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } } } },
            { t: { 1000: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } } } },
            [
                {
                    path: ['t', '1000'],
                    pathTypes: ['object', 'object'],
                    valueAtPath: { test1: { text: ['hiz'], text2: 'hiz2' }, test2: { text: ['hi2'] } },
                    prevAtPath: { test1: { text: ['hi'] }, test2: { text: ['hi2'] } },
                },
            ],
        );
    });
    test('Set does not fire if unchanged', () => {
        const obs = observable({ test: { test1: 'hi' } });
        const handler = jest.fn();
        obs.test.onChange(handler);
        obs.test.test1.set('hi');
        expect(handler).toHaveBeenCalledTimes(0);
    });
    test('Primitive has no keys', () => {
        const obs = observable({ val: 10 });
        expect(Object.keys(obs.val)).toEqual([]);
    });
    test('Unlisten unlistens', () => {
        const obs = observable({ val: 10 });
        let numCalls = 0;
        const unlisten = obs.onChange(() => {
            numCalls++;
        });
        obs.val.set(20);
        expect(numCalls).toBe(1);
        unlisten();
        obs.val.set(30);
        expect(numCalls).toBe(1);
    });
});
describe('undefined', () => {
    test('undefined is undefined', () => {
        const obs = observable({ test: undefined });
        expect(obs.test.get()).toEqual(undefined);
    });
    test('Can dot through undefined', () => {
        interface Data {
            test?: {
                test2?: {
                    test3?: string;
                };
            };
        }
        const obs = observable<Data>({ test: undefined });
        expect(obs.test.test2.test3.get()).toEqual(undefined);
    });
    test('Can set through undefined', () => {
        interface Data {
            test?: {
                test2?: {
                    test3?: string;
                };
            };
        }
        const obs = observable<Data>({ test: undefined });
        obs.test.test2.test3.set('hi');
        expect(obs.test.test2.test3.get()).toEqual('hi');
    });
    test('Set undefined to value and back', () => {
        // TODO: Replace `any`
        type Data = any;
        // type Data = {
        //     [key: string]: string | Data | undefined;
        // };
        const obs = observable<Data>({ test: { test2: { test3: undefined } } });
        const handler = expectChangeHandler(obs.test);
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
            { test2: { test3: undefined } },
            [
                {
                    path: ['test2', 'test3'],
                    pathTypes: ['object', 'object'],
                    valueAtPath: { test4: 'hi4', test5: 'hi5' },
                    prevAtPath: undefined,
                },
            ],
        );
        obs.test.test2.test3.set(undefined);
        expect(obs.test.test2.test3.get()).toEqual(undefined);
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.get()).toEqual({ test: { test2: { test3: undefined } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: undefined } },
            { test2: { test3: { test4: 'hi4', test5: 'hi5' } } },
            [
                {
                    path: ['test2', 'test3'],
                    pathTypes: ['object', 'object'],
                    valueAtPath: undefined,
                    prevAtPath: { test4: 'hi4', test5: 'hi5' },
                },
            ],
        );
        obs.test.test2.test3.set({ test4: 'hi6', test5: 'hi7' });
        expect(obs.test.test2.test3.get()).toEqual({ test4: 'hi6', test5: 'hi7' });
        expect(obs.test.test2.get()).toEqual({ test3: { test4: 'hi6', test5: 'hi7' } });
        expect(obs.test.get()).toEqual({ test2: { test3: { test4: 'hi6', test5: 'hi7' } } });
        expect(obs.get()).toEqual({ test: { test2: { test3: { test4: 'hi6', test5: 'hi7' } } } });
        expect(handler).toHaveBeenCalledWith(
            { test2: { test3: { test4: 'hi6', test5: 'hi7' } } },
            { test2: { test3: undefined } },
            [
                {
                    path: ['test2', 'test3'],
                    pathTypes: ['object', 'object'],
                    valueAtPath: { test4: 'hi6', test5: 'hi7' },
                    prevAtPath: undefined,
                },
            ],
        );
    });
    test('Set deep primitive undefined to value and back', () => {
        const obs = observable({ test: { test2: { test3: undefined as string | undefined } } });
        const handler = expectChangeHandler(obs.test);
        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.test2.test3.get()).toEqual(undefined);
        obs.test.test2.test3.set('hi');
        expect(obs.test.test2.test3.get()).toEqual('hi');
        expect(obs.test.test2.test3.get()).toEqual('hi');
        expect(obs.test.test2.get()).toEqual({ test3: 'hi' });
        expect(obs.test.get()).toEqual({ test2: { test3: 'hi' } });
        expect(obs.get()).toEqual({ test: { test2: { test3: 'hi' } } });
        expect(handler).toHaveBeenCalledWith({ test2: { test3: 'hi' } }, { test2: { test3: undefined } }, [
            { path: ['test2', 'test3'], pathTypes: ['object', 'object'], valueAtPath: 'hi', prevAtPath: undefined },
        ]);
        obs.test.test2.test3.set(undefined);
        expect(obs.test.test2.test3.get()).toEqual(undefined);
        expect(obs.test.test2.get()).toEqual({ test3: undefined });
        expect(obs.test.get()).toEqual({ test2: { test3: undefined } });
        expect(obs.get()).toEqual({ test: { test2: { test3: undefined } } });
        expect(handler).toHaveBeenCalledWith({ test2: { test3: undefined } }, { test2: { test3: 'hi' } }, [
            { path: ['test2', 'test3'], pathTypes: ['object', 'object'], valueAtPath: undefined, prevAtPath: 'hi' },
        ]);
        obs.test.test2.test3.set('hi');
        expect(obs.test.test2.test3.get()).toEqual('hi');
        expect(obs.test.test2.test3.get()).toEqual('hi');
        expect(obs.test.test2.get()).toEqual({ test3: 'hi' });
        expect(obs.test.test2.get()).toEqual({ test3: 'hi' });
        expect(obs.test.get()).toEqual({ test2: { test3: 'hi' } });
        expect(obs.get()).toEqual({ test: { test2: { test3: 'hi' } } });
        expect(handler).toHaveBeenCalledWith({ test2: { test3: 'hi' } }, { test2: { test3: undefined } }, [
            { path: ['test2', 'test3'], pathTypes: ['object', 'object'], valueAtPath: 'hi', prevAtPath: undefined },
        ]);
        obs.test.test2.set({ test3: 'hi2' });
        expect(obs.test.test2.test3.get()).toEqual('hi2');
        expect(obs.test.test2.test3.get()).toEqual('hi2');
        expect(obs.test.test2.get()).toEqual({ test3: 'hi2' });
        expect(obs.test.test2.get()).toEqual({ test3: 'hi2' });
        expect(obs.test.get()).toEqual({ test2: { test3: 'hi2' } });
        expect(obs.get()).toEqual({ test: { test2: { test3: 'hi2' } } });
        expect(handler).toHaveBeenCalledWith({ test2: { test3: 'hi2' } }, { test2: { test3: 'hi' } }, [
            { path: ['test2'], pathTypes: ['object'], valueAtPath: { test3: 'hi2' }, prevAtPath: { test3: 'hi' } },
        ]);
    });
});
describe('Equality', () => {
    test('Equality', () => {
        const obs = observable({ val: { val2: 10 } });
        const v = { val2: 20 };
        obs.val.set(v);
        expect(obs.val.get() === v).toEqual(true);
        expect(obs.val.get() == v).toEqual(true);
    });
    test('Set with same object does not notify', () => {
        const obs = observable({ test: { text: 'hi' } });
        const handler = expectChangeHandler(obs.test);
        const test = obs.test.get();
        obs.test.set(obs.test.get());
        expect(obs.test.get()).toBe(test);
        expect(handler).not.toHaveBeenCalled();
    });
    test('Set with equivalent object does not notify', () => {
        const obs = observable({ test: { text: 'hi' } });
        const handler = expectChangeHandler(obs.test);
        const test = obs.test.get();
        const cloned = JSON.parse(JSON.stringify(test));
        obs.test.set(cloned);
        expect(obs.test.get()).not.toBe(test);
        expect(obs.test.get()).toBe(cloned);
        expect(handler).not.toHaveBeenCalled();
    });
    test('Set with same array does not notify', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        const handler = expectChangeHandler(obs.arr);
        const arr = obs.arr.get();
        obs.arr.set(obs.arr.get());
        expect(obs.arr.get()).toBe(arr);
        expect(handler).not.toHaveBeenCalled();
    });
    test('isObservable on null', () => {
        const obs = observable({ arr: null });
        const isObs = isObservable(obs.arr);
        expect(isObs).toEqual(true);
    });
});
describe('Safety', () => {
    // Note: If TypeScript adds support for variant accessors on indexed types we could add back unsafe mode.
    // But for now trying to assign directly causes type errors.
    // https://github.com/microsoft/TypeScript/issues/43826
    test('Prevent writes on objects', () => {
        const obs = observable({ test: { text: 't' } });
        expect(() => {
            // @ts-expect-error: Cannot assign to leaf node
            obs.test.text = 'hello';
        }).toThrow();
        expect(() => {
            // @ts-expect-error: Cannot assign to parent node
            obs.test = { text: 'hello' };
        }).toThrow();
        expect(() => {
            // @ts-expect-error: Cannot delete a node
            delete obs.test;
        }).toThrow();
    });
    test('Observable functions always work', () => {
        const obs = observable({ get: 'hi', assign: 'hi' });
        expect(typeof obs.get === 'function').toBe(true);
        expect(typeof obs.assign === 'function').toBe(true);
        obs.set({ get: 'hello', assign: 'hi' });
        expect(typeof obs.get === 'function').toBe(true);
        expect(typeof obs.assign === 'function').toBe(true);
    });
    test('Nested assign', () => {
        const obs = observable({ child: { a: 0, b: 0 } });
        const obs2 = observable({ child2: { a: 0, b: 0 } });
        const comp = computed(() => {
            const a = obs.child.a.get();

            obs2.child2.assign({ a: 2, b: 2 });

            return a;
        });

        comp.get();

        obs.child.assign({ a: 1, b: 1 });
    });
});
describe('Primitives', () => {
    test('Primitive node object', () => {
        const obs = observable({ test: 'hi' });
        expect(obs.test).not.toEqual('hi');
        expect(obs.test.get()).toEqual('hi');
    });
    test('Primitive set', () => {
        const obs = observable({ test: { text: 't' } });
        expect(obs.test.text.get()).toEqual('t');
        obs.test.text.set('t2');
        expect(obs.test.text.get()).toEqual('t2');
    });
    test('Deep primitive access', () => {
        const obs = observable({ val: { val2: { val3: 10 } } });
        expect(obs.val.val2.val3.get()).toEqual(10);
        obs.val.val2.val3.set(20);
        expect(obs.val.val2.val3.get()).toEqual(20);
    });
    test('observable root can be primitive', () => {
        const obs = observable(10);
        expect(obs.get()).toEqual(10);
        obs.set(20);
        expect(obs.get()).toEqual(20);
    });
    test('set observable primitive notifies', () => {
        const obs = observable(10);
        expect(obs.get()).toEqual(10);
        const handler = expectChangeHandler(obs);
        obs.set(20);
        expect(obs.get()).toEqual(20);
        expect(handler).toHaveBeenCalledWith(20, 10, [{ path: [], pathTypes: [], valueAtPath: 20, prevAtPath: 10 }]);
    });
    test('Primitive callback does not have value', () => {
        const obs = observable(10);
        const handler = expectChangeHandler(obs);
        obs.onChange(handler);
        obs.set(20);
        expect(handler).toHaveBeenCalledWith(20, 10, [{ path: [], pathTypes: [], valueAtPath: 20, prevAtPath: 10 }]);
    });
    test('Set function is stable', () => {
        const obs = observable({ num1: 10, num2: 20 });
        const set = obs.num1.set;
        expect(obs.num2.get()).toEqual(20);
        set(30);
        expect(obs.num1.get()).toEqual(30);
    });
    test('Assign on a primitive errors', () => {
        const obs = observable({ num1: 10, num2: 20 });

        expect(() => {
            // @ts-expect-error Expect this to throw an error
            obs.num1.assign({ test: 'hi' });
            // @ts-expect-error Expect this to throw an error
            obs.num1.assign;
        }).toThrow();

        // This error will leave observableBatch in progress, so force end it
        endBatch(true);
    });
    test('toString() and valueOf()', () => {
        const obs = observable({ val: 10 });
        expect(obs.val.toString()).toBe('10');
        expect(obs.val.valueOf()).toBe(10);
    });
});
describe('Array', () => {
    test('Basic array', () => {
        interface Data {
            arr: number[];
        }
        const obs = observable<Data>({ arr: [] });
        expect(obs.arr.get()).toEqual([]);
        obs.arr.set([1, 2, 3]);
        expect(obs.arr.get()).toEqual([1, 2, 3]);
    });
    test('Push to pre-filled array', () => {
        const obs = observable({ arr: [{ id: 'test1', data: 'test1' }] });
        obs.arr.push({ id: 'test2', data: 'test2' });
        expect(obs.arr.get()).toEqual([
            { id: 'test1', data: 'test1' },
            { id: 'test2', data: 'test2' },
        ]);
    });
    test('Push to pre-filled array at root', () => {
        const obs = observable([{ id: 'test1', data: 'test1' }]);
        obs.push({ id: 'test2', data: 'test2' });
        expect(obs.get()).toEqual([
            { id: 'test1', data: 'test1' },
            { id: 'test2', data: 'test2' },
        ]);
    });
    test('Array at root', () => {
        type Data = number[];
        const obs = observable<Data>([]);
        expect(obs.get()).toEqual([]);
        obs.set([1, 2, 3]);
        expect(obs.get()).toEqual([1, 2, 3]);
    });
    test('Array at root listens', () => {
        type Data = number[];
        const obs = observable<Data>([]);
        expect(obs.get()).toEqual([]);
        const handler = expectChangeHandler(obs);

        obs.push(1);
        expect(handler).toHaveBeenCalledWith([1], [], [{ path: [], pathTypes: [], valueAtPath: [1], prevAtPath: [] }]);
    });
    test('Array functions', () => {
        const obs = observable({ arr: [] });
        const handler = jest.fn();
        obs.arr.onChange(handler);
    });
    test('Array map runs on proxies', () => {
        const obs = observable({ arr: [1, 2] });

        expect(obs.arr.map((a) => a.get())).toEqual([1, 2]);
    });
    test('Array push', () => {
        const obs = observable({ test: ['hi'] });
        const handler = expectChangeHandler(obs);

        obs.test.push('hello');
        expect(obs.test.get()).toEqual(['hi', 'hello']);
        expect(handler).toHaveBeenCalledWith({ test: ['hi', 'hello'] }, { test: ['hi'] }, [
            { path: ['test'], pathTypes: ['array'], valueAtPath: ['hi', 'hello'], prevAtPath: ['hi'] },
        ]);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Array splice', () => {
        const obs = observable({ test: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }] });
        const handler = expectChangeHandler(obs);
        const last = obs.test[2].get();
        obs.test.splice(1, 1);
        expect(obs.test.get()).toEqual([{ text: 'hi' }, { text: 'there' }]);
        expect(obs.test[1].get()).toBe(last);
        expect(handler).toHaveBeenCalledWith(
            { test: [{ text: 'hi' }, { text: 'there' }] },
            { test: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }] },
            [
                {
                    path: ['test'],
                    pathTypes: ['array'],
                    valueAtPath: [{ text: 'hi' }, { text: 'there' }],
                    prevAtPath: [{ text: 'hi' }, { text: 'hello' }, { text: 'there' }],
                },
            ],
        );
        expect(handler).toHaveBeenCalledTimes(1);
    });
    // test('Array of objects requires ids', () => {
    //     const obs = observable({ test: [{ text: 'hi' }] });
    // });
    test('Array swap', () => {
        const obs = observable({ test: [1, 2, 3, 4, 5] });
        const arr = obs.test.get();
        let tmp = arr[1];
        obs.test[1].set(arr[4]);
        obs.test[4].set(tmp);
        expect(obs.test.get()).toEqual([1, 5, 3, 4, 2]);
        tmp = arr[1];
        obs.test[1].set(arr[4]);
        obs.test[4].set(tmp);
        expect(obs.test.get()).toEqual([1, 2, 3, 4, 5]);
    });
    test('Array swap notifies if not shallow listener', () => {
        const obs = observable([{ id: 1 }, { id: 2 }]);
        const handlerItem = expectChangeHandler(obs);

        obs.set([{ id: 2 }, { id: 1 }]);

        expect(handlerItem).toHaveBeenCalledWith(
            [{ id: 2 }, { id: 1 }],
            [{ id: 1 }, { id: 2 }],
            [{ path: [], pathTypes: [], valueAtPath: [{ id: 2 }, { id: 1 }], prevAtPath: [{ id: 1 }, { id: 2 }] }],
        );
    });
    test('Array set', () => {
        interface Data {
            test: Array<{ id: number }>;
        }
        const obs = observable<Data>({ test: [] });
        const arr = [];
        for (let i = 0; i < 1000; i++) {
            arr[i] = { id: i };
        }
        obs.test.set(arr);
        expect(obs.test.length).toEqual(1000);
        expect(obs.test[3].id.get()).toEqual(3);
    });
    test('Array swap with objects', () => {
        const obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        const arr = obs.test;
        let tmp = arr[1].get();
        obs.test[1].set(arr[4].peek());
        obs.test[4].set(tmp);
        expect(obs.test.get()).toEqual([{ text: 1 }, { text: 5 }, { text: 3 }, { text: 4 }, { text: 2 }]);
        expect(obs.test[1].get()).toEqual({ text: 5 });
        expect(arr[1].get()).toEqual({ text: 5 });
        expect(obs.test[4].get()).toEqual({ text: 2 });
        expect(arr[4].get()).toEqual({ text: 2 });
        tmp = arr[1].get();
        obs.test[1].set(arr[4].peek());
        obs.test[4].set(tmp);
        expect(obs.test.get()).toEqual([{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
    });
    test('Array swap with objects and then remove', () => {
        const obs = observable({
            test: [
                { zid: 1, text: 1 },
                { zid: 2, text: 2 },
                { zid: 3, text: 3 },
                { zid: 4, text: 4 },
                { zid: 5, text: 5 },
            ],
            test_keyExtractor: (item: { zid: string }) => item.zid,
        });
        const arr = obs.test;
        const tmp = arr[1].get();
        obs.test[1].set(arr[4].peek());
        obs.test[4].set(tmp);
        obs.test.splice(0, 1);
        expect(obs.test[0].get()).toEqual({ zid: 5, text: 5 });
    });
    test('Array swap if empty', () => {
        interface Data {
            test: Array<unknown>;
        }
        const obs = observable<Data>({ test: [] });
        const tmp = obs.test[1];
        obs.test[1].set(obs.test[4]);
        expect(obs.test.get()).toEqual([undefined, undefined]);
        obs.test[4].set(tmp);
        expect(obs.test.get()).toEqual([undefined, undefined, undefined, undefined, undefined]);
    });
    test('Clear array fires listener once', () => {
        const obs = observable({ arr: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        const handler = jest.fn();
        obs.arr.onChange(handler);
        obs.arr.set([]);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Array clear if listening', () => {
        const obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        obs.test[0].onChange(() => {});
        obs.test[1].onChange(() => {});
        obs.test[2].onChange(() => {});
        obs.test[3].onChange(() => {});
        obs.test[4].onChange(() => {});
        obs.test.set([]);
        expect(obs.test.get()).toEqual([]);
        expect(obs.test.get()).toEqual([]);
        expect(obs.test.length).toEqual(0);
        expect(obs.test.length).toEqual(0);
        expect(obs.test.map((a) => a)).toEqual([]);
    });
    test('Array splice fire events', () => {
        const obs = observable({
            test: [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
        });
        const handler = expectChangeHandler(obs.test);
        obs.test[0].onChange(() => {});
        obs.test[1].onChange(() => {});
        obs.test[2].onChange(() => {});
        obs.test[3].onChange(() => {});
        obs.test[4].onChange(() => {});
        obs.test.splice(0, 1);
        expect(obs.test[0].get()).toEqual({ id: 2, text: 2 });
        expect(obs.test.get()).toEqual([
            { id: 2, text: 2 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 5, text: 5 },
        ]);
        expect(obs.test.get()).toEqual([
            { id: 2, text: 2 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 5, text: 5 },
        ]);
        expect(obs.test.length).toEqual(4);
        expect(obs.test.map((a) => a.get())).toEqual([
            { id: 2, text: 2 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 5, text: 5 },
        ]);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            [
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
            [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [
                        { id: 2, text: 2 },
                        { id: 3, text: 3 },
                        { id: 4, text: 4 },
                        { id: 5, text: 5 },
                    ],
                    prevAtPath: [
                        { id: 1, text: 1 },
                        { id: 2, text: 2 },
                        { id: 3, text: 3 },
                        { id: 4, text: 4 },
                        { id: 5, text: 5 },
                    ],
                },
            ],
        );
    });
    test('Array with listeners clear', () => {
        const obs = observable({
            test: [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
        });
        const handler = jest.fn();
        obs.test.onChange(handler, { trackingType: true });
        obs.test[0].onChange(() => {});
        obs.test[1].onChange(() => {});
        obs.test[2].onChange(() => {});
        obs.test[3].onChange(() => {});
        obs.test[4].onChange(() => {});
        obs.test.set([]);
    });
    test('Array set by index', () => {
        const obs = observable({ test: [{ text: 'hi' }] });
        obs.test[0].set({ text: 'hi2' });
        expect(obs.test[0].get()).toEqual({ text: 'hi2' });
    });
    test('Array map returns observables', () => {
        const obs = observable({ arr: [{ text: 'hi' }] });
        const vals = obs.arr.map((a) => isObservable(a));
        expect(vals).toEqual([true]);
    });
    test('Array forEach returns observables', () => {
        interface Data {
            arr: Array<{ text: string }>;
        }
        const obs = observable<Data>({ arr: [{ text: 'hi' }] });
        const arr: unknown[] = [];
        obs.arr.forEach((a) => arr.push(isObservable(a)));
        expect(arr).toEqual([true]);
    });
    test('Array splice does not call child listeners', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'h1' },
                { id: 'h2', text: 'h2' },
            ],
        });
        const handler = expectChangeHandler(obs.arr[0]);
        obs.arr.splice(0, 1);
        expect(handler).not.toBeCalled();
    });
    test('Array has stable reference', () => {
        interface Data {
            arr: Array<{ id: string; text: string }>;
        }
        const obs = observable<Data>({ arr: [] });
        obs.arr.set([
            { id: 'h1', text: 'hi' },
            { id: 'h2', text: 'hello' },
        ]);
        const second = obs.arr[1];
        const handler = expectChangeHandler(second);
        obs.arr.splice(0, 1);
        obs.arr[0].text.set('hello there');

        expect(handler).toHaveBeenCalledWith({ id: 'h2', text: 'hello there' }, { id: 'h2', text: 'hello' }, [
            { path: ['text'], pathTypes: ['object'], valueAtPath: 'hello there', prevAtPath: 'hello' },
        ]);
    });
    test('Array has stable reference 2', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'hi' },
                { id: 'h2', text: 'hello' },
                { id: 'h3', text: 'h3' },
            ],
        });
        const second = obs.arr[1];
        const handler = expectChangeHandler(second);

        // Prep it with proxies
        for (let i = 0; i < obs.arr.length; i++) {
            obs.arr[i].text;
        }

        const arr = obs.arr.get();
        const tmp = arr[1];
        obs.arr[1].set(arr[2]);
        obs.arr[2].set(tmp);
        // This makes second become h3

        expect(handler).toHaveBeenCalledWith({ id: 'h3', text: 'h3' }, { id: 'h2', text: 'hello' }, [
            { path: [], pathTypes: [], valueAtPath: { id: 'h3', text: 'h3' }, prevAtPath: { id: 'h2', text: 'hello' } },
        ]);

        obs.arr.splice(0, 1);

        expect(second.get()).toEqual({ id: 'h3', text: 'h3' });
        obs.arr[0].text.set('hello there');

        expect(handler).toHaveBeenCalledWith({ id: 'h3', text: 'hello there' }, { id: 'h2', text: 'hello' }, [
            {
                path: [],
                pathTypes: [],
                valueAtPath: { id: 'h3', text: 'hello there' },
                prevAtPath: { id: 'h2', text: 'hello' },
            },
        ]);
    });
    test('Array has stable references 3', () => {
        interface Data {
            arr: Array<{ id: string; text: string }>;
        }
        const obs = observable<Data>({ arr: [] });
        obs.arr.set([
            { id: 'h1', text: 'hi' },
            { id: 'h2', text: 'h2' },
            { id: 'h3', text: 'h3' },
        ]);
        const [, second, third] = obs.arr.map((a) => a);
        const [, secondID, thirdID] = obs.arr.map((a) => a.id);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const handler = expectChangeHandler(second);
        obs.arr.splice(0, 1);
        const [second2, third2] = obs.arr.map((a) => a);
        const [secondID2, thirdID2] = obs.arr.map((a) => a.id);

        expect(second).toBe(second2);
        expect(secondID).toBe(secondID2);
        expect(third).toBe(third2);
        expect(thirdID).toBe(thirdID2);
    });
    test('Array has stable swaps', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'h1' },
                { id: 'h2', text: 'h2' },
                { id: 'h3', text: 'h3' },
            ],
        });
        const second = obs.arr[1];
        const handler = expectChangeHandler(second);

        const arr = obs.arr.get();
        const tmp = arr[1];
        obs.arr[1].set(arr[2]);
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'h1' },
            { id: 'h3', text: 'h3' },
            { id: 'h3', text: 'h3' },
        ]);
        expect(tmp).toEqual({ id: 'h2', text: 'h2' });
        obs.arr[2].set(tmp);

        // Second becomes h3 still at index 1

        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'h1' },
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'h2' },
        ]);
        expect(handler).toBeCalledWith({ id: 'h3', text: 'h3' }, { id: 'h2', text: 'h2' }, [
            { path: [], pathTypes: [], valueAtPath: { id: 'h3', text: 'h3' }, prevAtPath: { id: 'h2', text: 'h2' } },
        ]);

        obs.arr[1].text.set('newtext');

        expect(handler).toBeCalledWith({ id: 'h3', text: 'newtext' }, { id: 'h3', text: 'h3' }, [
            { path: ['text'], pathTypes: ['object'], valueAtPath: 'newtext', prevAtPath: 'h3' },
        ]);
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'h1' },
            { id: 'h3', text: 'newtext' },
            { id: 'h2', text: 'h2' },
        ]);
        expect(second.get()).toEqual({ id: 'h3', text: 'newtext' });
    });
    test('Array has stable swaps 2', () => {
        const obs = observable({
            arr: [
                { id: 'h1', text: 'hi' },
                { id: 'h2', text: 'hello' },
                { id: 'h3', text: 'h3' },
            ],
        });
        const second = obs.arr[1];
        const third = obs.arr[2];
        const handler = expectChangeHandler(second);
        const handler3 = expectChangeHandler(third);

        let arr = obs.arr.get();
        let tmp = arr[1];
        obs.arr[1].set(arr[2]);
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'hi' },
            { id: 'h3', text: 'h3' },
            { id: 'h3', text: 'h3' },
        ]);
        expect(tmp).toEqual({ id: 'h2', text: 'hello' });
        obs.arr[2].set(tmp);

        expect(second.get()).toEqual({ id: 'h3', text: 'h3' });
        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'hi' },
            { id: 'h3', text: 'h3' },
            { id: 'h2', text: 'hello' },
        ]);
        expect(handler).toHaveBeenCalledWith({ id: 'h3', text: 'h3' }, { id: 'h2', text: 'hello' }, [
            { path: [], pathTypes: [], valueAtPath: { id: 'h3', text: 'h3' }, prevAtPath: { id: 'h2', text: 'hello' } },
        ]);
        expect(handler3).toHaveBeenCalledWith({ id: 'h2', text: 'hello' }, { id: 'h3', text: 'h3' }, [
            { path: [], pathTypes: [], valueAtPath: { id: 'h2', text: 'hello' }, prevAtPath: { id: 'h3', text: 'h3' } },
        ]);

        arr = obs.arr.get();
        tmp = arr[1];
        obs.arr[1].set(arr[2]);
        obs.arr[2].set(tmp);

        expect(obs.arr.get()).toEqual([
            { id: 'h1', text: 'hi' },
            { id: 'h2', text: 'hello' },
            { id: 'h3', text: 'h3' },
        ]);

        expect(second.get()).toEqual({ id: 'h2', text: 'hello' });

        expect(handler).toHaveBeenCalledWith({ id: 'h3', text: 'h3' }, { id: 'h2', text: 'hello' }, [
            { path: [], pathTypes: [], valueAtPath: { id: 'h3', text: 'h3' }, prevAtPath: { id: 'h2', text: 'hello' } },
        ]);
        expect(handler3).toHaveBeenCalledWith({ id: 'h2', text: 'hello' }, { id: 'h3', text: 'h3' }, [
            { path: [], pathTypes: [], valueAtPath: { id: 'h2', text: 'hello' }, prevAtPath: { id: 'h3', text: 'h3' } },
        ]);

        obs.arr.splice(0, 1);

        expect(obs.arr[0].get()).toEqual({ id: 'h2', text: 'hello' });
        expect(second.get()).toEqual({ id: 'h2', text: 'hello' });

        obs.arr[0].text.set('hello there');

        expect(handler).toHaveBeenCalledWith({ id: 'h2', text: 'hello there' }, { id: 'h2', text: 'hello' }, [
            { path: ['text'], pathTypes: ['object'], valueAtPath: 'hello there', prevAtPath: 'hello' },
        ]);
    });
    test('Array set with just a swap optimized', () => {
        const obs = observable({
            test: [
                { id: 1, text: 1 },
                { id: 2, text: 2 },
                { id: 3, text: 3 },
                { id: 4, text: 4 },
                { id: 5, text: 5 },
            ],
        });
        const handler = jest.fn();
        const handlerShallow = jest.fn();
        obs.test.onChange(handler);
        obs.test.onChange(handlerShallow, { trackingType: optimized });
        const handlerItem = expectChangeHandler(obs.test[1]);

        const arr = obs.test.get().slice();
        const tmp = arr[1];
        arr[1] = arr[4];
        arr[4] = tmp;
        obs.test.set(arr);

        expect(obs.test.get()).toEqual([
            { id: 1, text: 1 },
            { id: 5, text: 5 },
            { id: 3, text: 3 },
            { id: 4, text: 4 },
            { id: 2, text: 2 },
        ]);

        expect(handler).toHaveBeenCalled();
        expect(handlerItem).toHaveBeenCalledWith({ id: 5, text: 5 }, { id: 2, text: 2 }, [
            { path: [], pathTypes: [], valueAtPath: { id: 5, text: 5 }, prevAtPath: { id: 2, text: 2 } },
        ]);
        expect(handlerShallow).not.toHaveBeenCalled();
    });
    test('Array set with different ids shallow', () => {
        const obs = observable({
            test: [{ id: 1, text: 1 }],
        });
        const handler = expectChangeHandler(obs.test, true);

        obs.test.set([{ id: 2, text: 2 }]);

        expect(obs.test.get()).toEqual([{ id: 2, text: 2 }]);

        expect(handler).toHaveBeenCalledWith(
            [{ id: 2, text: 2 }],
            [{ id: 1, text: 1 }],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [{ id: 2, text: 2 }],
                    prevAtPath: [{ id: 1, text: 1 }],
                },
            ],
        );
    });
    test('Array set with no ids shallow', () => {
        const obs = observable({
            test: [{ text: 1 }],
        });
        const handler = expectChangeHandler(obs.test, true);

        obs.test.set([{ text: 2 }]);

        expect(obs.test.get()).toEqual([{ text: 2 }]);

        expect(handler).toHaveBeenCalledWith(
            [{ text: 2 }],
            [{ text: 1 }],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [{ text: 2 }],
                    prevAtPath: [{ text: 1 }],
                },
            ],
        );
    });
    test('Array.filter return is observables', () => {
        const obs = observable({
            test: [{ text: 1 }],
        });
        expect(obs.test.filter((a) => isObservable(a))).toHaveLength(1);
        expect(isObservable(obs.test.filter((a) => isObservable(a))[0])).toBe(true);
    });
    test('Array.find result is observable', () => {
        const obs = observable({
            test: [{ text: 1 }],
        });
        expect(isObservable(obs.test.find((a) => isObservable(a)))).toBe(true);
        expect(obs.test.find((a) => isObservable(a))?.text.get()).toBe(1);
    });
    test('Array.find no result is undefined', () => {
        const obs = observable({
            test: [{ text: '0' }],
        });
        expect(obs.test.find((a) => a.text.peek() === 'hi')).toBe(undefined);
    });
    test('Notifies on second element', () => {
        const obs = observable({
            test: [{ text: 1 }, { text: 2 }],
        });
        const handler = expectChangeHandler(obs.test[0].text);
        const handler2 = expectChangeHandler(obs.test[1].text);
        obs.set({ test: [{ text: 11 }, { text: 22 }] });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(11, 1, [{ path: [], pathTypes: [], prevAtPath: 1, valueAtPath: 11 }]);
        expect(handler2).toHaveBeenCalledWith(22, 2, [{ path: [], pathTypes: [], prevAtPath: 2, valueAtPath: 22 }]);
    });
    test('Set array mapping previous with dates', () => {
        const oldDate = new Date(+new Date() - 1000);
        const obs = observable({
            todos: [
                {
                    id: '1',
                    date: oldDate,
                },
            ],
        });
        const handler = expectChangeHandler(obs.todos);

        const newDate = new Date(+new Date() - 1500);
        obs.todos.set((arr) => arr.map((v) => ({ ...v, date: newDate })));
        expect(obs.todos.get()).toEqual([
            {
                id: '1',
                date: newDate,
            },
        ]);
        expect(handler).toHaveBeenCalledWith(
            [
                {
                    id: '1',
                    date: newDate,
                },
            ],
            [
                {
                    id: '1',
                    date: oldDate,
                },
            ],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [
                        {
                            id: '1',
                            date: newDate,
                        },
                    ],
                    prevAtPath: [
                        {
                            id: '1',
                            date: oldDate,
                        },
                    ],
                },
            ],
        );
        const newDate2 = new Date();
        obs.todos.set((arr) => arr.map((v) => ({ ...v, date: newDate2 })));
        expect(obs.todos.get()).toEqual([
            {
                id: '1',
                date: newDate2,
            },
        ]);
        expect(handler).toHaveBeenCalledTimes(2);

        expect(handler).toHaveBeenCalledWith(
            [
                {
                    id: '1',
                    date: newDate2,
                },
            ],
            [
                {
                    id: '1',
                    date: newDate,
                },
            ],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [
                        {
                            id: '1',
                            date: newDate2,
                        },
                    ],
                    prevAtPath: [
                        {
                            id: '1',
                            date: newDate,
                        },
                    ],
                },
            ],
        );
    });
    test('Array includes', () => {
        const obs = observable([0, 1, 2]);
        expect(obs.includes(1)).toBe(true);
    });
});
describe('Deep changes keep listeners', () => {
    test('Deep set keeps listeners', () => {
        const obs = observable({ test: { test2: { test3: 'hello' } } });
        const handler = expectChangeHandler(obs.test.test2.test3);
        obs.set({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });
        expect(handler).toHaveBeenCalledWith('hi there', 'hello', [
            { path: [], pathTypes: [], valueAtPath: 'hi there', prevAtPath: 'hello' },
        ]);
    });
    test('Deep assign keeps listeners', () => {
        const obs = observable({ test: { test2: { test3: 'hello' } } });
        const handler = expectChangeHandler(obs.test.test2.test3);
        obs.assign({
            test: {
                test2: {
                    test3: 'hi there',
                },
            },
        });
        expect(handler).toHaveBeenCalledWith('hi there', 'hello', [
            { path: [], pathTypes: [], valueAtPath: 'hi there', prevAtPath: 'hello' },
        ]);
    });
    test('Deep set keeps keys', () => {
        const obs = observable({ test: { test2: { a1: 'ta' } as Record<string, any> } });
        obs.test.test2.a1.set({ text: 'ta1' });
        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        obs.test.test2.assign({ a2: { text: 'ta2' } });
        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        obs.test.test2.assign({ a3: { text: 'ta3' } });
        expect(obs.get()).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
    });
    test('Set shallow of deep object keeps keys', () => {
        const obs = observable({ test: { test2: { a0: { text: 't0' } } as Record<string, any> } });
        obs.test.set({ test2: { a1: { text: 'ta1' } } });
        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1']);
        obs.test.set({ test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } });
        expect(obs.get()).toEqual({ test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' } } } });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2']);
        obs.test.test2.assign({ a3: { text: 'ta3' } });
        expect(obs.get()).toEqual({
            test: { test2: { a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } } },
        });
        expect(obs.test.test2.get()).toEqual({ a1: { text: 'ta1' }, a2: { text: 'ta2' }, a3: { text: 'ta3' } });
        expect(obs.test.test2.a1.get()).toEqual({ text: 'ta1' });
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3']);
        obs.test.test2.assign({ a4: { text: 'ta4' } });
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
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4']);
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
        expect(Object.keys(obs.test.test2)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
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
        expect(obs.test.test2.get().a1).toEqual(undefined);
        expect(Object.keys(obs.test.test2)).toEqual(['a6']);
        expect(Object.keys(obs.test.test2)).toEqual(['a6']);
    });
    test('Array numbers getPrevious', () => {
        interface Data {
            arr: number[];
        }
        const obs = observable<Data>({ arr: [0, 1, 2] });
        const handler = expectChangeHandler(obs.arr);
        const handler2 = expectChangeHandler(obs);
        obs.arr.set([1, 2, 3]);
        expect(handler).toHaveBeenCalledWith(
            [1, 2, 3],
            [0, 1, 2],
            [{ path: [], pathTypes: [], valueAtPath: [1, 2, 3], prevAtPath: [0, 1, 2] }],
        );
        expect(handler2).toHaveBeenCalledWith({ arr: [1, 2, 3] }, { arr: [0, 1, 2] }, [
            { path: ['arr'], pathTypes: ['array'], valueAtPath: [1, 2, 3], prevAtPath: [0, 1, 2] },
        ]);
    });
    test('Array objects getPrevious', () => {
        interface Data {
            arr: { _id: number }[];
            arr_keyExtractor: (item: any) => string;
        }
        const arr_keyExtractor = (el: { _id: string }) => el._id;
        const obs = observable<Data>({ arr: [{ _id: 0 }, { _id: 1 }, { _id: 2 }], arr_keyExtractor });
        const handler = expectChangeHandler(obs.arr);
        const handler2 = expectChangeHandler(obs);
        obs.arr.set([{ _id: 1 }, { _id: 2 }, { _id: 3 }]);
        expect(handler).toHaveBeenCalledWith(
            [{ _id: 1 }, { _id: 2 }, { _id: 3 }],
            [{ _id: 0 }, { _id: 1 }, { _id: 2 }],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [{ _id: 1 }, { _id: 2 }, { _id: 3 }],
                    prevAtPath: [{ _id: 0 }, { _id: 1 }, { _id: 2 }],
                },
            ],
        );
        expect(handler2).toHaveBeenCalledWith(
            { arr: [{ _id: 1 }, { _id: 2 }, { _id: 3 }], arr_keyExtractor },
            { arr: [{ _id: 0 }, { _id: 1 }, { _id: 2 }] },
            [
                {
                    path: ['arr'],
                    pathTypes: ['array'],
                    valueAtPath: [{ _id: 1 }, { _id: 2 }, { _id: 3 }],
                    prevAtPath: [{ _id: 0 }, { _id: 1 }, { _id: 2 }],
                },
            ],
        );
    });
    test('Array objects push getPrevious', () => {
        interface Data {
            arr: { _id: number }[];
        }
        const obs = observable<Data>({ arr: [{ _id: 0 }, { _id: 1 }, { _id: 2 }] });
        const handler = expectChangeHandler(obs.arr);
        obs.arr.push({ _id: 3 });
        expect(handler).toHaveBeenCalledWith(
            [{ _id: 0 }, { _id: 1 }, { _id: 2 }, { _id: 3 }],
            [{ _id: 0 }, { _id: 1 }, { _id: 2 }],
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: [{ _id: 0 }, { _id: 1 }, { _id: 2 }, { _id: 3 }],
                    prevAtPath: [{ _id: 0 }, { _id: 1 }, { _id: 2 }],
                },
            ],
        );
    });
    test('Array perf', () => {
        const obs = observable({ arr: [] as { id: number; value: number }[] });
        for (let i = 0; i < 10000; i++) {
            obs.arr[i].set({ id: i, value: i });
            obs.arr[i].onChange(() => {});
        }
        const now = performance.now();
        obs.arr.splice(1, 1);
        const then = performance.now();

        expect(then - now).toBeLessThan(process.env.CI === 'true' ? 100 : 30);
    });
});
describe('Delete', () => {
    test('Delete key', () => {
        const obs = observable({ test: { text: 't', text2: 't2' } });
        obs.test.text2.delete();
        expect(obs.get()).toEqual({ test: { text: 't' } });
    });
    test('Delete self', () => {
        const obs = observable({ test: { text: 't' }, test2: { text2: 't2' } });
        obs.test2.delete();
        expect(obs.get()).toEqual({ test: { text: 't' } });
    });
    test('Delete property fires listeners', () => {
        const obs = observable({ obj: { val: true } });
        const handler = expectChangeHandler(obs.obj.val);
        obs.obj.val.delete();
        expect(handler).toHaveBeenCalledWith(undefined, true, [
            { path: [], pathTypes: [], valueAtPath: undefined, prevAtPath: true },
        ]);
        expect(Object.keys(obs.obj)).toEqual([]);
    });
    test('Delete property fires listeners 2', () => {
        const obs = observable({ obj: { val: true } });
        const handler = expectChangeHandler(obs.obj.val);
        obs.obj.delete();
        expect(handler).toHaveBeenCalledWith(undefined, true, [
            { path: [], pathTypes: [], valueAtPath: undefined, prevAtPath: true },
        ]);
        expect(Object.keys(obs)).toEqual([]);
    });
    test('Delete fires listeners of children', () => {
        const obs = observable({ obj: { num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } } });
        const handler = expectChangeHandler(obs.obj.num1);
        obs.obj.delete();
        expect(handler).toHaveBeenCalledWith(undefined, 1, [
            { path: [], pathTypes: [], valueAtPath: undefined, prevAtPath: 1 },
        ]);
    });
    test('Accessing a deleted node', () => {
        const obs = observable({ obj: { text: 'hi' } });
        const obj = obs.obj;
        obs.obj.delete();
        expect(obs.get()).toEqual({});

        obj.text.set('hello');
        expect(obs.get()).toEqual({ obj: { text: 'hello' } });
    });
    test('Delete key', () => {
        const obs = observable({ test: { text: 't', text2: 't2' } });
        obs.test.text2.delete();
        expect(Object.keys(obs.test)).toEqual(['text']);
    });
    test('Delete primitive fires parent listener', () => {
        const obs = observable({ test: '' });
        const handler = expectChangeHandler(obs);
        obs.test.delete();
        expect(handler).toHaveBeenCalledWith({}, { test: '' }, [
            { path: ['test'], pathTypes: ['object'], valueAtPath: undefined, prevAtPath: '' },
        ]);
    });
    test('Delete root', () => {
        const obs = observable({ test: { text: 't', text2: 't2' } });
        obs.delete();
        expect(obs.test.peek()).toEqual(undefined);
        expect(obs.peek()).toEqual(undefined);
    });
    test('Delete primitive', () => {
        const obs = observablePrimitive(true);
        obs.delete();
        expect(obs.peek()).toEqual(undefined);
    });
});
describe('when', () => {
    test('when equals', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        when(() => obs.val.get() === 20, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(20);
        expect(handler).toHaveBeenCalled();
    });
    test('when equals immediate', () => {
        const obs = observable({ val: 10 });
        const handler = jest.fn();
        when(() => obs.val.get() === 10, handler);
        expect(handler).toHaveBeenCalled();
    });
    test('when equals deep', () => {
        const obs = observable({ test: { test2: '', test3: '' } });
        const handler = jest.fn();
        when(() => obs.test.test2.get() === 'hello', handler);
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hi');
        expect(handler).not.toHaveBeenCalled();
        obs.test.test2.set('hello');
        expect(handler).toHaveBeenCalled();
    });
    test('when true', () => {
        const obs = observable({ val: false });
        const handler = jest.fn();
        when(() => obs.val.get(), handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalled();
    });
    test('when true starting true', () => {
        const obs = observable({ val: true });
        const handler = jest.fn();
        when(() => obs.val.get(), handler);
        expect(handler).toHaveBeenCalled();
        obs.val.set(false);
        expect(handler).toHaveBeenCalledTimes(1);
        obs.val.set(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('when with primitive', () => {
        const obs = observable({ val: false });
        const handler = jest.fn();
        when(obs.val, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalled();
    });
    test('when disposes itself', () => {
        const obs = observable({ val: false });
        const handler = jest.fn();
        when(obs.val, handler);
        expect(handler).not.toHaveBeenCalled();
        obs.val.set(true);
        expect(handler).toHaveBeenCalledTimes(1);
        obs.val.set(10 as any);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('when with effect is promise', async () => {
        const obs = observable({ val: false });
        expect(when(obs.val, () => 'test')).resolves.toEqual('test');
        obs.val.set(true);
    });
    test('when with promise', async () => {
        let didResolve = false;
        const promise = new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 10);
        });
        when(promise, () => (didResolve = true));
        expect(didResolve).toEqual(false);
        await promiseTimeout(20);
        expect(didResolve).toEqual(true);
    });
});
describe('Shallow', () => {
    test('Shallow set primitive', () => {
        interface Data {
            val: boolean;
            val2?: number;
        }
        const obs = observable<Data>({ val: false });
        const handler = jest.fn();
        obs.onChange(handler, { trackingType: true });
        obs.val.set(true);
        expect(handler).not.toHaveBeenCalled();
        obs.val2.set(10);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Shallow deep object', () => {
        const obs = observable({ val: { val2: { val3: 'hi' } } });
        const handler = jest.fn();
        obs.onChange(handler, { trackingType: true });
        obs.val.val2.val3.set('hello');
        expect(handler).not.toHaveBeenCalled();
    });
    test('Shallow array', () => {
        interface Data {
            data: Array<{ text: number }>;
            selected: number;
        }
        const obs = observable<Data>({ data: [], selected: 0 });
        const handler = jest.fn();
        obs.data.onChange(handler, { trackingType: true });
        obs.data.set([{ text: 1 }, { text: 2 }]);
        expect(handler).toHaveBeenCalledTimes(1);
        // Setting an index in an array should not notify the array
        obs.data[0].set({ text: 11 });
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Key delete notifies shallow', () => {
        interface Data {
            test: Record<string, { text: string } | undefined>;
        }
        const obs = observable<Data>({ test: { key1: { text: 'hello' }, key2: { text: 'hello2' } } });
        const handler = jest.fn();
        obs.test.onChange(handler, { trackingType: true });

        obs.test.key2.delete();

        expect(handler).toHaveBeenCalledTimes(1);

        // But setting to undefined does not
        obs.test.key1.set(undefined);

        expect(handler).toHaveBeenCalledTimes(1);

        obs.test.key3.set({ text: 'hello3' });

        expect(handler).toHaveBeenCalledTimes(2);
    });
    test('Array splice notifies shallow', () => {
        interface Data {
            arr: Array<{ text: string }>;
        }
        const obs = observable<Data>({ arr: [{ text: 'hello' }, { text: 'hello2' }] });
        const handler = jest.fn();
        const handler2 = jest.fn();
        obs.arr.onChange(handler, { trackingType: true });
        obs.arr.onChange(handler2);

        obs.arr.splice(1, 1);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);

        obs.arr.push({ text: 'hello3' });

        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler2).toHaveBeenCalledTimes(2);
    });
    test('Shallow tracks object getting set to undefined', () => {
        interface Data {
            test:
                | undefined
                | {
                      text: string;
                  };
        }
        const obs = observable<Data>({ test: { text: 'hi' } });
        const handler = jest.fn();
        obs.test.onChange(handler, { trackingType: true });

        obs.test.set(undefined);

        expect(handler).toHaveBeenCalledTimes(1);
    });
});
describe('Event', () => {
    test('Event', () => {
        const evt = event();
        const handler = jest.fn();
        evt.on(handler);
        expect(handler).not.toHaveBeenCalled();
        evt.fire();
        expect(handler).toHaveBeenCalledTimes(1);
        evt.fire();
        evt.fire();
        evt.fire();
        expect(handler).toHaveBeenCalledTimes(4);
    });
    test('Event is observable', () => {
        const evt = event();
        expect(isObservable(evt)).toEqual(true);
    });
    test('Event is event', () => {
        const evt = event();
        expect(isEvent(evt)).toEqual(true);
    });
    test('Event get', () => {
        const evt = event();
        expect(evt.get()).toEqual(0);
        evt.fire();
        expect(evt.get()).toEqual(1);
    });
});
describe('Promise values', () => {
    test('Promise child', async () => {
        const promise = Promise.resolve(10);
        const obs = observable({ promise });
        expect(obs.promise).resolves.toEqual(10);
        expect(obs.promise.state.isLoaded.get()).toEqual(false);
        await promise;
        expect(obs.promise.get()).toEqual(10);
        expect(obs.promise.state.isLoaded.get()).toEqual(true);
    });
    test('Promise child with _state', async () => {
        const promise = Promise.resolve(10);
        const obs = observable({ promise });
        expect(obs.promise).resolves.toEqual(10);
        expect(obs.promise._state.isLoaded.get()).toEqual(false);
        await promise;
        expect(obs.promise.get()).toEqual(10);
        expect(obs.promise._state.isLoaded.get()).toEqual(true);
    });
    test('Promise child works when set later', async () => {
        const obs = observable({ promise: undefined as unknown as Promise<number> });
        let resolver: (value: number) => void;
        const promise = new Promise<number>((resolve) => (resolver = resolve));
        obs.promise.set(promise);
        expect(obs.promise.state.isLoaded.get()).toEqual(false);
        // @ts-expect-error Fake error
        resolver(10);
        await promise;
        expect(obs.promise.get()).toEqual(10);
        expect(obs.promise.state.isLoaded.get()).toEqual(true);
    });
    test('Promise child works when assigned later', async () => {
        const obs = observable({ promise: undefined as unknown as Promise<number> });
        let resolver: (value: number) => void;
        const promise = new Promise<number>((resolve) => (resolver = resolve));
        obs.assign({ promise });
        expect(obs.promise.state.isLoaded.get()).toEqual(false);
        // @ts-expect-error Fake error
        resolver(10);
        await promise;
        expect(obs.promise.get()).toEqual(10);
        expect(obs.promise.state.isLoaded.get()).toEqual(true);
    });
    test('Promise object becomes value', async () => {
        const promise = Promise.resolve({ child: 10 });
        const obs = observable(promise);

        expect(obs.state.isLoaded.get()).toEqual(false);
        await promise;
        expect(obs.get()).toEqual({ child: 10 });
        expect(obs.child.get()).toEqual(10);
        expect(obs.state.isLoaded.get()).toEqual(true);
    });
    test('Promise primitive becomes value', async () => {
        const promise = Promise.resolve(10);
        const obs = observable(promise);
        await promise;
        expect(obs.get()).toEqual(10);
    });
    test('Promise value in set primitive', async () => {
        const promise = Promise.resolve(10);
        const obs = observable<number>(0);
        obs.set(promise);
        await promise;
        expect(obs.get()).toEqual(10);
    });
    test('Promise value in set object', async () => {
        const promise = Promise.resolve(10);
        const obs = observable<{ promise: number | undefined }>({ promise: undefined });
        obs.promise.set(promise);
        await promise;
        expect(obs.promise.get()).toEqual(10);
    });
    test('Promise value in set is error if it rejects', async () => {
        const promise = Promise.reject('test');
        const obs = observable<{
            promise: Promise<number>;
        }>({ promise: undefined as any });
        obs.promise.set(promise);
        try {
            await promise;
        } catch {
            await promiseTimeout(0);
        }
        expect(obs.promise.state.error.get()).toEqual('test');
    });
    test('when callback works with promises', async () => {
        let resolver: (value: number) => void;
        const promise = new Promise<number>((resolve) => (resolver = resolve));
        const obs = observable<number>(promise);
        let didWhen = false;
        when(obs, () => {
            didWhen = true;
        });
        expect(didWhen).toBe(false);
        resolver!(10);
        await obs;
        expect(didWhen).toBe(true);
    });
    test('when works with promises', async () => {
        let resolver: (value: number) => void;
        const promise = new Promise<number>((resolve) => (resolver = resolve));
        const obs = observable<number>(promise);
        let didWhen = false;
        when(obs).then(() => {
            didWhen = true;
        });
        expect(didWhen).toBe(false);
        resolver!(10);
        await obs;
        expect(didWhen).toBe(true);
    });
    test('Promise child stays pending until activated', async () => {
        const promise = Promise.resolve(10);
        const obs = observable({ promise });
        await promise;
        // Still pending because it was not activated
        expect(obs.promise).resolves.toEqual(10);
        expect(obs.promise.state.isLoaded.get()).toEqual(false);

        // This get activates it but it takes a frame for it to equal the value
        expect(obs.promise.get()).not.toEqual(10);
        await promiseTimeout();
        // Now it equals the value
        expect(obs.promise.get()).toEqual(10);
    });
});
describe('Batching', () => {
    test('Assign is batched', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = jest.fn();
        obs.num1.onChange(handler);
        obs.num2.onChange(handler);
        obs.num3.onChange(handler);
        obs.assign({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Setting an object calls each handler once', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        const handler3 = jest.fn();
        obs.num1.onChange(handler1);
        obs.num2.onChange(handler2);
        obs.num3.onChange(handler3);
        obs.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
        expect(handler3).toHaveBeenCalledTimes(1);
    });
    test('Batching is batched', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = jest.fn();
        obs.num1.onChange(handler);
        obs.num2.onChange(handler);
        obs.num3.onChange(handler);
        beginBatch();
        beginBatch();
        beginBatch();
        obs.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        endBatch();
        endBatch();
        endBatch();
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Setting a child within a batch modifies the existing change', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = expectChangeHandler(obs);
        beginBatch();
        obs.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        obs.obj.text.set('hello2');
        endBatch();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            {
                num1: 11,
                num2: 22,
                num3: 33,
                obj: { text: 'hello2' },
            },
            {
                num1: 1,
                num2: 2,
                num3: 3,
                obj: { text: 'hi' },
            },
            [
                {
                    path: [],
                    pathTypes: [],
                    valueAtPath: {
                        num1: 11,
                        num2: 22,
                        num3: 33,
                        obj: { text: 'hello2' },
                    },
                    prevAtPath: {
                        num1: 1,
                        num2: 2,
                        num3: 3,
                        obj: { text: 'hi' },
                    },
                },
            ],
        );
    });
    test('Setting a child within a batch modifies the existing change when it`s a deep child', async () => {
        const obs = observable({ parent: { num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } } });
        const handler = expectChangeHandler(obs);
        beginBatch();
        obs.parent.set({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        obs.parent.obj.text.set('hello2');
        endBatch();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            {
                parent: {
                    num1: 11,
                    num2: 22,
                    num3: 33,
                    obj: { text: 'hello2' },
                },
            },
            {
                parent: {
                    num1: 1,
                    num2: 2,
                    num3: 3,
                    obj: { text: 'hi' },
                },
            },
            [
                {
                    path: ['parent'],
                    pathTypes: ['object'],
                    valueAtPath: {
                        num1: 11,
                        num2: 22,
                        num3: 33,
                        obj: { text: 'hello2' },
                    },
                    prevAtPath: {
                        num1: 1,
                        num2: 2,
                        num3: 3,
                        obj: { text: 'hi' },
                    },
                },
            ],
        );
    });
    test('Assign getPrevious is correct', async () => {
        const obs = observable({ num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } });
        const handler = expectChangeHandler(obs);
        obs.assign({
            num1: 11,
            num2: 22,
            num3: 33,
            obj: { text: 'hello' },
        });
        expect(handler).toHaveBeenCalledWith(
            {
                num1: 11,
                num2: 22,
                num3: 33,
                obj: { text: 'hello' },
            },
            { num1: 1, num2: 2, num3: 3, obj: { text: 'hi' } },
            [
                { path: ['num1'], pathTypes: ['object'], prevAtPath: 1, valueAtPath: 11 },
                { path: ['num2'], pathTypes: ['object'], prevAtPath: 2, valueAtPath: 22 },
                { path: ['num3'], pathTypes: ['object'], prevAtPath: 3, valueAtPath: 33 },
                { path: ['obj'], pathTypes: ['object'], prevAtPath: { text: 'hi' }, valueAtPath: { text: 'hello' } },
            ],
        );
    });
    test('Observe function called only once in batch', () => {
        const obs = observable({ a: 'hi', b: 'hello' });
        let val = '';
        let callCount = 0;
        observe(() => {
            callCount++;
            val = obs.a.get() + obs.b.get();
        });
        expect(callCount).toEqual(1);
        batch(() => {
            obs.a.set('hi2');
            obs.b.set('hello2');
        });
        expect(callCount).toEqual(2);
        expect(val).toEqual('hi2hello2');
    });
    test('After batch works correctly', () => {
        const obs = observable({ a: 'hi', b: 'hello' });
        let didAfterBatch: boolean | undefined;
        let didStartBatch = false;
        observe(() => {
            obs.get();
            expect(didAfterBatch).toEqual(didStartBatch ? false : undefined);
        });
        batch(
            () => {
                didStartBatch = true;
                didAfterBatch = false;
                obs.a.set('hi2');
                obs.b.set('hello2');
            },
            () => {
                didAfterBatch = true;
            },
        );
        observe(() => {
            obs.get();
            expect(didAfterBatch).toEqual(true);
        });
    });
    test('After batch works recursively', () => {
        const obs = observable({ a: 'hi' });
        const obs2 = observable({ a: 'hi' });
        const obs3 = observable({ a: 'hi' });
        let didStartBatch2 = false;
        let didAfterBatch2: boolean | undefined;
        observe(() => {
            const a = obs3.a.get();
            if (a === 'hi2') {
                expect(didAfterBatch2).toEqual(true);
            }
        });
        observe(() => {
            const a = obs2.a.get();
            if (a === 'hi2') {
                expect(didAfterBatch2).toEqual(false);
                obs3.a.set('hi2');
            }
        });
        observe(() => {
            if (obs.a.get() === 'hi2') {
                batch(
                    () => {
                        didStartBatch2 = true;
                        didAfterBatch2 = false;
                        obs2.a.set('hi2');
                        expect(didAfterBatch2).toEqual(didStartBatch2 ? false : undefined);
                    },
                    () => {
                        didAfterBatch2 = true;
                    },
                );
            }
        });
        observe(() => {
            obs2.get();
            expect(didAfterBatch2).toEqual(didStartBatch2 ? false : undefined);
        });
        batch(() => {
            obs.a.set('hi2');
        });
    });
});
describe('Observable with promise', () => {
    test('Promise', async () => {
        let resolver: ((value: number) => void) | undefined;
        const promise = new Promise<number>((resolve) => {
            resolver = resolve;
        });
        const obs = observable(promise);
        expect(obs.state.isLoaded.get()).toEqual(false);
        if (resolver) {
            resolver(10);
        }
        await promiseTimeout(0);
        expect(obs.state.isLoaded.get()).toEqual(true);
        expect(obs.get()).toEqual(10);
    });
    test('when with promise observable', async () => {
        let resolver: ((value: number) => void) | undefined;
        const promise = new Promise<number>((resolve) => {
            resolver = resolve;
        });
        const obs = observable(promise);

        expect(obs.state.isLoaded.get()).toEqual(false);

        const fn = jest.fn();
        when(() => obs.get() === 10, fn);

        if (resolver) {
            resolver(10);
        }

        await promiseTimeout(1000);

        expect(fn).toHaveBeenCalled();
        expect(obs.state.isLoaded.get()).toEqual(true);
    });
    test('recursive batches prevented', async () => {
        let isInInnerBatch = false;
        const obs = observable({ num: 0 });
        const obs2 = observable({ num: 0 });
        let numCalls = 0;
        observe(() => {
            numCalls++;
            obs2.get();
            expect(isInInnerBatch).toEqual(false);
            isInInnerBatch = false;
        });
        obs.onChange(() => {
            isInInnerBatch = true;
            beginBatch();
            obs2.num.set(2);
            endBatch();
            isInInnerBatch = false;
        });
        batch(() => {
            obs.num.set(1);
        });
        expect(numCalls).toEqual(2);
    });
});
describe('Locking', () => {
    test('Locking', () => {
        const obs = observable({ text: 'hi' });
        lockObservable(obs, true);
        expect(() => obs.text.set('hello')).toThrowError();
        expect(() => obs.text.set('hello')).toThrowError();
        expect(() => obs.set({ text: 'hello' })).toThrowError();
        expect(obs.get()).toEqual({ text: 'hi' });
        lockObservable(obs, false);
        obs.text.set('hey');
        expect(obs.get()).toEqual({ text: 'hey' });
    });
});
describe('Primitive <-> Object', () => {
    test('Starting as undefined', () => {
        const obs = observable<{ test: string }>(undefined);
        expect(obs.get()).toEqual(undefined);
        obs.set({ test: 'hi' });
        expect(obs.get()).toEqual({ test: 'hi' });
    });
    test('Starting as string', () => {
        const obs = observable<{ test: string } | string>('hello');
        expect(obs.get()).toEqual('hello');
        obs.set({ test: 'hi' });
        expect(obs.get()).toEqual({ test: 'hi' });
    });
    test('Object to string', () => {
        const obs = observable<{ test: string } | string>({ test: 'hi' });
        expect(obs.get()).toEqual({ test: 'hi' });
        obs.set('hello');
        expect(obs.get()).toEqual('hello');
    });
});
describe('Primitive root', () => {
    test('observable root can be primitive', () => {
        const obs = observable(10);
        expect(obs.get()).toEqual(10);
        obs.set(20);
        expect(obs.get()).toEqual(20);
    });
    test('Primitive callback', () => {
        const obs = observable(10);
        const handler = expectChangeHandler(obs);
        obs.onChange(handler);
        obs.set(20);
        expect(handler).toHaveBeenCalledWith(20, 10, [{ path: [], pathTypes: [], valueAtPath: 20, prevAtPath: 10 }]);
    });
    test('observable root can be primitive', () => {
        const obs = observable(1);
        const node = (obs as any)[symbolGetNode];
        expect(node.root._).toEqual(1);
    });
});
describe('Primitive boolean', () => {
    test('toggle observable primitive boolean', () => {
        const obs = observable(false);
        obs.toggle();
        expect(obs.get()).toEqual(true);
    });
    test('toggle observable boolean', () => {
        const obs = observable({ value: false });
        obs.value.toggle();
        expect(obs.get().value).toEqual(true);
    });
    test('observable primitive not boolean has no toggle', () => {
        const obs = observable(0);
        expect(() => {
            // @ts-expect-error Expect this to throw an error
            obs.toggle();
        }).toThrow();
        expect(obs.get()).toEqual(0);
    });
    test('observable not boolean has no toggle', () => {
        const obs = observable({ value: 0 });
        expect(() => {
            // @ts-expect-error Expect this to throw an error
            obs.value.toggle();
            // @ts-expect-error Expect this to throw an error
            obs.toggle();
        }).toThrow();
        expect(obs.get().value).toEqual(0);
    });
});
describe('Opaque object', () => {
    test('Opaque object does not create proxy', () => {
        const obs = observable({ test: { opaque: opaqueObject({ value: { subvalue: true } }) } });
        const opaque = obs.test.opaque;
        expect(isObservable(opaque)).toBe(true);

        const opaqueValue = obs.test.opaque.value;
        expect(isObservable(opaqueValue)).toBe(false);
        expect(opaqueValue.subvalue).toBe(true);
    });
    test('Opaque object does not fire listeners', () => {
        const obs = observable({ test: { opaque: opaqueObject({ value: { subvalue: true } }) } });
        const handler = expectChangeHandler(obs);
        const opaque = obs.test.opaque.get();
        opaque.value.subvalue = false;
        expect(handler).not.toHaveBeenCalled();
    });
    test('Opaque object does not fire listeners 2', () => {
        const obs = observable({ test: { opaque: opaqueObject({ value: { subvalue: true } }) } });
        const handler = expectChangeHandler(obs);
        obs.test.opaque.value.subvalue = false;
        expect(handler).not.toHaveBeenCalled();
    });
    test('Opaque object does not error on circular references', () => {
        const circular = { value: { subvalue: true, circularProblem: undefined } };
        // @ts-expect-error Doing this on purpose
        circular.value.circularProblem = circular;
        const obs = observable({ circ: opaqueObject(circular) });
        expect(console.error).toHaveBeenCalledTimes(0);

        expect(obs.get().circ.value.subvalue).toEqual(true);
    });
});
describe('Observe', () => {
    test('Observe basic', () => {
        const obs = observable(0);
        let count = 0;
        observe(() => (count = obs.get()));
        obs.set(1);
        expect(count).toEqual(1);
        obs.set(2);
        expect(count).toEqual(2);
    });
    test('Observe with reaction', () => {
        const obs = observable(0);
        let count = 0;
        observe<number>(
            () => obs.get(),
            (e) => (count = e.value!),
        );
        obs.set(1);
        expect(count).toEqual(1);
        obs.set(2);
        expect(count).toEqual(2);
    });
    test('Observe with reaction previous', () => {
        const obs = observable(0);
        let count = 0;
        let prev;
        observe<number>(
            () => obs.get(),
            ({ value, previous }) => {
                count = value!;
                prev = previous;
            },
        );
        obs.set(1);
        expect(count).toEqual(1);
        expect(prev).toEqual(0);
        obs.set(2);
        expect(count).toEqual(2);
        expect(prev).toEqual(1);
    });
    test('Observe with reaction does not track', () => {
        const obs = observable(0);
        const obsOther = observable(0);
        let count = 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let callCount = 0;
        observe<number>(
            () => obs.get(),
            (e) => {
                callCount++;
                count = e.value!;
                obsOther.get();
            },
        );
        obs.set(1);
        expect(count).toEqual(1);
        obsOther.set(1);
        expect(count).toEqual(1);
    });
    test('Observe with reaction and array', () => {
        let lastLength = 0;
        const state$ = observable({
            arr: [1, 2, 3, 4],
        });

        observe(state$.arr, () => {
            const num = state$.arr.peek();
            lastLength = num.length;
        });

        expect(lastLength).toEqual(4);
        state$.arr.push(10);
        expect(lastLength).toEqual(5);
    });
});
describe('Error detection', () => {
    test('Circular objects in set', () => {
        jest.clearAllMocks();

        const a: any = {};
        a.c = { a: {} };

        const obs = observable(a);
        // Have to activate it first for it to error
        obs.c.get();

        const aa: any = {};
        aa.c = { a: aa };

        expect(console.error).toHaveBeenCalledTimes(0);

        obs.set(aa);

        expect(console.error).toHaveBeenCalledTimes(1);
    });
});
describe('Functions', () => {
    test('Functions work normally', () => {
        let count = 0;
        const obs = observable({
            test: () => {
                count++;
            },
        });
        obs.test();
        expect(count).toEqual(1);
    });
    test('Functions added later work normally', () => {
        let count = 0;
        const obs = observable({} as any);
        obs.assign({
            test: () => {
                count++;
            },
        });
        obs.test();
        expect(count).toEqual(1);
    });
    test('Nested functions with params work normally', () => {
        let count = 0;
        const obs = observable({
            child: {
                test: (num: number) => {
                    count += num;
                },
            },
        });
        obs.child.test(2);
        expect(count).toEqual(2);
    });
    test('Set does not delete functions', () => {
        let count = 0;
        const obs = observable({
            child: {
                val: 0,
                test: (num: number) => {
                    count = num;
                },
            },
        });
        obs.child.test(2);
        expect(count).toEqual(2);

        // @ts-expect-error Blocked by TS but handle it anyway
        obs.child.set({ val: 1 });
        obs.child.test(4);
        expect(count).toEqual(4);
        expect(obs.child.val.get()).toEqual(1);
    });
    test('Function assigned later', () => {
        const obs = observable({ text: 'hi' } as { text: any; test: any });
        obs.assign({
            test: () => 'hi!',
        });
        expect(obs.test === 'hi!');
    });
});

describe('Extend observableFunctions', () => {
    test('Extend observableFunctions works', () => {
        configureLegendState({
            observableFunctions: {
                testfn: (node: NodeValue, arg1, arg2) => getNodeValue(node) + arg2,
            },
        });

        const obs = observable({ value: 0 });

        // @ts-expect-error Would need to add to types
        expect(obs.value.testfn(1, 'hi')).toEqual('0hi');

        const prim = observable(0);

        // @ts-expect-error Would need to add to types
        expect(prim.testfn(1, 'hi')).toEqual('0hi');
    });
});
describe('$', () => {
    test('$ works like get()', () => {
        const obs = observable({ value: 'hi' });

        expect(obs.value.$).toEqual('hi');
    });
    test('$ works like set()', () => {
        const obs = observable({ value: 'hi', test2: { t: 'hi' } });
        const handler = expectChangeHandler(obs.value);

        obs.value.$ = 'hello';

        expect(obs.value.$).toEqual('hello');
        expect(obs.value.get()).toEqual('hello');

        expect(handler).toHaveBeenCalledWith('hello', 'hi', [
            { path: [], pathTypes: [], valueAtPath: 'hello', prevAtPath: 'hi' },
        ]);
    });
    test('$ works like set() with objects', () => {
        const obs = observable({ value: 'hi', test2: { t: 'hi' } });
        obs.test2.$ = { t: 'hello' };

        expect(obs.test2.$).toEqual({ t: 'hello' });
        expect(obs.test2.t.$).toEqual('hello');
    });
    test('$ works on primitives', () => {
        const obs = observable(0);
        obs.$ = 1;

        expect(obs.$).toEqual(1);
    });
});
describe('_', () => {
    test('_ works like peek()', () => {
        const obs = observable({ value: 'hi' });

        expect(obs.value._).toEqual('hi');
    });
    test('_ works like setting directly with no notifying', () => {
        const obs = observable({ value: 'hi', test2: { t: 'hi' } });
        const handler = expectChangeHandler(obs.value);

        obs.value._ = 'hello';

        expect(obs.value._).toEqual('hello');
        expect(obs.value.peek()).toEqual('hello');

        expect(handler).not.toHaveBeenCalled();
    });
    test('_ works like set() with objects', () => {
        const obs = observable({ value: 'hi', test2: { t: 'hi' } });
        obs.test2._ = { t: 'hello' };

        expect(obs.test2._).toEqual({ t: 'hello' });
        expect(obs.test2.t._).toEqual('hello');
    });
    test('_ to set works if value is undefined', () => {
        const obs = observable({ value: 'hi', test2: { t: 'hi' } });
        obs.test2._ = undefined;

        expect(obs.test2._).toEqual(undefined);
        expect(obs.test2.t._).toEqual(undefined);
    });
    test('_ works on primitives', () => {
        const obs = observable(0);
        obs._ = 1;

        expect(obs._).toEqual(1);
    });
});
describe('Built-in functions', () => {
    test('Adding observables should throw', () => {
        const obs = observable({ x: 0, y: 0 });

        const x = obs.x;
        const y = obs.y;

        expect(() => {
            // @ts-expect-error Testing error
            x + y;
        }).toThrowError(/observable is not a primitive/);
    });
});
describe('setAtPath', () => {
    test('At root', () => {
        const value = {};

        setAtPath(value, [], [], { x: true });
    });
    test('At one level deep', () => {
        const value = {};

        setAtPath(value, ['x'], ['object'], true);
    });
    test('Two levels deep', () => {
        const value = { test: {} };

        setAtPath(value, ['test', 'x'], ['object', 'object'], true);
    });
});
