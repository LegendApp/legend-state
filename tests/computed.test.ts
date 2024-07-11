import {
    Observable,
    batch,
    beginBatch,
    endBatch,
    getNode,
    isObservable,
    linked,
    observable,
    observe,
    syncState,
    when,
} from '../index';
import { synced } from '../sync';
import { expectChangeHandler, promiseTimeout } from './testglobals';

let spiedConsole: jest.SpyInstance;

beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    spiedConsole = jest.spyOn(global.console, 'error').mockImplementation(() => {});
});
afterAll(() => {
    spiedConsole.mockRestore();
});

export function filterRecord<T>(obj: Record<string, T>, filter: (value: T) => boolean): Record<string, T> {
    const out: Record<string, T> = {};
    Object.keys(obj).forEach((key) => {
        if (filter(obj[key])) {
            out[key] = obj[key];
        }
    });
    return out;
}

describe('Functions', () => {
    test('Normal function runs once', () => {
        let num = 0;
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable({
            fn: () => {
                num++;
                return obs.test.get() + obs.test2.get();
            },
        });
        expect(comp.fn()).toEqual(30);
        expect(num).toEqual(1);
    });
    test('Function with string typed as function or observable', () => {
        const comp = observable({
            fn: (text: string) => {
                return text;
            },
        });
        expect(comp.fn('hi')).toEqual('hi');
        expect(comp.fn['hi'].get()).toEqual('hi');
    });
});
describe('Computed', () => {
    test('Basic computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(() => obs.test.get() + obs.test2.get());
        expect(comp.get()).toEqual(30);
    });
    test('Child of computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable({ totals: () => ({ sum: obs.test.get() + obs.test2.get() }) });
        expect(comp.totals.sum.get()).toEqual(30);
    });
    test('Observing computed runs once if not activated', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(() => obs.test.get() + obs.test2.get());
        let num = 0;
        let observedValue;
        observe(() => {
            observedValue = comp.get();
            num++;
        });

        expect(num).toEqual(1);
        expect(observedValue).toEqual(30);
    });
    test('Observing computed runs once if activated', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(() => obs.test.get() + obs.test2.get());
        let num = 0;
        let observedValue;
        comp.get();
        observe(() => {
            observedValue = comp.get();
            num++;
        });

        expect(num).toEqual(1);
        expect(observedValue).toEqual(30);
    });
    test('Multiple computed changes', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(() => obs.test.get() + obs.test2.get());
        expect(comp.get()).toEqual(30);
        const handler = expectChangeHandler(comp);
        obs.test.set(5);
        expect(handler).toHaveBeenCalledWith(25, 30, [{ path: [], pathTypes: [], valueAtPath: 25, prevAtPath: 30 }]);
        expect(comp.get()).toEqual(25);
        obs.test.set(1);
        expect(handler).toHaveBeenCalledWith(21, 25, [{ path: [], pathTypes: [], valueAtPath: 21, prevAtPath: 25 }]);
        expect(comp.get()).toEqual(21);
    });
    test('Computed object is observable', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(() => ({ value: obs.test.get() + obs.test2.get() }));

        expect(comp.get()).toEqual({ value: 30 });
        expect(comp.value.get()).toEqual(30);
        const handler = expectChangeHandler(comp.value);

        obs.test.set(5);

        expect(handler).toHaveBeenCalledWith(25, 30, [{ path: [], pathTypes: [], valueAtPath: 25, prevAtPath: 30 }]);
    });
    test('Computed is lazy', () => {
        const fn = jest.fn();
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(() => {
            fn();
            return { v: obs.test.get() + obs.test2.get() };
        });
        expect(fn).not.toHaveBeenCalled();
        comp.get();
        expect(fn).toHaveBeenCalled();
    });
    test('Computed is lazy, activates on child get', () => {
        const fn = jest.fn();
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(() => {
            fn();
            return { v: obs.test.get() + obs.test2.get() };
        });
        expect(fn).not.toHaveBeenCalled();
        comp.v.get();
        expect(fn).toHaveBeenCalled();
    });
    test('Computed with promise', async () => {
        const isDone$ = observable(false);
        const obs = observable(new Promise<string>((resolve) => setTimeout(() => resolve('hi'), 0)));
        const comp = observable(() => {
            const value = obs.get();
            if (value) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve('hi there');
                        setTimeout(() => {
                            isDone$.set(true);
                        });
                    }, 0);
                });
            }
        });
        expect(comp.get()).toEqual(undefined);
        await when(comp);
        await when(isDone$);
        expect(comp.get()).toEqual('hi there');
    });
    test('Changing the target', () => {
        const stateTest$ = observable({
            id: '1',
            items: [{ id: '1' }, { id: '2' }, { id: '3' }],
            selectedItem: () => {
                const id = stateTest$.id.get();
                const item$ = stateTest$.items.find((_item: any) => _item.id.peek() === id)!;
                return item$;
            },
        });

        let latestValue: { id: string };

        observe(
            () => {
                latestValue = stateTest$.selectedItem.get();
            },
            { immediate: true },
        );

        expect(latestValue!).toEqual({ id: '1' });

        stateTest$.id.set('2');

        expect(latestValue!).toEqual({ id: '2' });

        stateTest$.id.set('3');

        expect(latestValue!).toEqual({ id: '3' });

        stateTest$.id.set('');

        expect(latestValue!).toEqual(undefined);
    });
    test('Operating on observable array ', () => {
        const stateTest$ = observable({
            items: { 1: { id: '1' }, 2: { id: '2' }, 3: { id: '3' }, 4: { id: '4' }, 20: { id: '20' } },
            evenItems: () => {
                return Object.values(stateTest$.items).filter((item$) => +item$.id.get() % 2 === 0);
            },
            smallEvenItems: () => {
                return Object.values(stateTest$.evenItems).filter((item$) => +item$.id.get() < 10);
            },
        });

        const evenItems = stateTest$.evenItems.get();
        expect(evenItems).toEqual([{ id: '2' }, { id: '4' }, { id: '20' }]);

        const smallEvenItems = stateTest$.smallEvenItems.get();
        expect(smallEvenItems).toEqual([{ id: '2' }, { id: '4' }]);

        stateTest$.items[2].id.set('21');

        const evenItems2 = stateTest$.evenItems.get();
        expect(evenItems2).toEqual([{ id: '4' }, { id: '20' }]);

        const smallEvenItems2 = stateTest$.smallEvenItems.get();
        expect(smallEvenItems2).toEqual([{ id: '4' }]);

        // The bug this test is checking was that this was causing a maximum callstack error
        stateTest$.items[2].id.set('2');

        const evenItems3 = stateTest$.evenItems.get();
        expect(evenItems3).toEqual([{ id: '2' }, { id: '4' }, { id: '20' }]);

        const smallEvenItems3 = stateTest$.smallEvenItems.get();
        expect(smallEvenItems3).toEqual([{ id: '2' }, { id: '4' }]);
    });
    test('Computed with changing nodes', async () => {
        const obs1$ = observable(false);
        const obs2$ = observable(false);
        const comp$ = observable(() => {
            return !obs1$.get() || !obs2$.get();
        });

        expect(comp$.get()).toEqual(true);
        obs1$.set(true);
        expect(comp$.get()).toEqual(true);
        obs2$.set(true);
        expect(comp$.get()).toEqual(false);
    });
    test('peeking self in computed should return the previous value', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable<{ prev: number; sum: number }>(() => ({
            prev: comp.sum.peek(),
            sum: obs.test.get() + obs.test2.get(),
        }));
        expect(comp.get()).toEqual({ prev: undefined, sum: 30 });
        obs.test.set(15);
        expect(comp.get()).toEqual({ prev: 30, sum: 35 });
        obs.test.set(11);
        expect(comp.get()).toEqual({ prev: 35, sum: 31 });
    });
});
describe('Accessor functions', () => {
    test('get fn', () => {
        const obs1 = observable(20);
        const obs = observable({
            get test2() {
                return obs1.get();
            },
        });

        const handler = expectChangeHandler(obs.test2);
        expect(obs.test2.get()).toEqual(20);
        obs1.set(10);
        expect(handler).toHaveBeenCalledWith(10, 20, [{ path: [], pathTypes: [], prevAtPath: 20, valueAtPath: 10 }]);
        expect(obs.test2.get()).toEqual(10);
    });
    test('get/set fn', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable({
            get test() {
                return obs.test.get() && obs.test2.get();
            },
            set test(value) {
                obs.test.set(value);
                obs.test2.set(value);
            },
        });

        expect(comp.test.get()).toEqual(false);
        comp.test.set(true);
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
});
describe('Two way Computed', () => {
    test('Bound to two, get', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable(() => obs.test.get() && obs.test2.get());
        expect(comp.get()).toEqual(false);
        obs.test.set(true);
        expect(comp.get()).toEqual(false);
        obs.test2.set(true);
        expect(comp.get()).toEqual(true);
    });
    test('Bound to two, set', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable(
            linked({
                set: ({ value }) => {
                    obs.test.set(value);
                    obs.test2.set(value);
                },
                get: () => obs.test.get() && obs.test2.get(),
            }),
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
    test('Bound to two, set with first param', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable(
            linked(() => obs.test.get() && obs.test2.get(), {
                set: ({ value }) => {
                    obs.test.set(value);
                    obs.test2.set(value);
                },
            }),
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
    test('Bound to two, set without observable wrap', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable(
            linked({
                set: ({ value }) => {
                    obs.test.set(value);
                    obs.test2.set(value);
                },
                get: () => obs.test.get() && obs.test2.get(),
            }),
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
    test('Bound to two, set child', () => {
        const obs = observable({ test: { a: 'hi' }, test2: false });
        const comp = observable(
            linked({
                set: ({ value }) => {
                    obs.test.set(value);
                },
                get: () => obs.test.get(),
            }),
        );
        expect(comp.a.get()).toEqual('hi');
        comp.a.set('bye');
        expect(comp.a.get()).toEqual('bye');
    });
    test('Bound to array, set', () => {
        const obs = observable([false, false, false, false, false]);
        const comp = observable(
            linked({
                set: ({ value }) => {
                    obs.forEach((child) => child.set(value));
                },
                get: () => {
                    return obs.every((val) => val.get());
                },
            }),
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs[0].get()).toEqual(true);
        expect(comp.get()).toEqual(true);
    });
    test('Bound to two, set, handler', () => {
        const obs = observable({ test: false, test2: false });
        const handler = expectChangeHandler(obs);
        const comp = observable(
            linked({
                set: ({ value }) => {
                    obs.test.set(value);
                    obs.test2.set(value);
                },
                get: () => obs.test.get() && obs.test2.get(),
            }),
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(handler).toHaveBeenCalledWith({ test: true, test2: true }, { test: false, test2: false }, [
            {
                path: ['test'],
                pathTypes: ['object'],
                prevAtPath: false,
                valueAtPath: true,
            },
            {
                path: ['test2'],
                pathTypes: ['object'],
                prevAtPath: false,
                valueAtPath: true,
            },
        ]);
        expect(handler).toHaveBeenCalledTimes(1);

        expect(comp.get()).toEqual(true);
    });
    test('Linked has set before activation', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable(
            linked({
                get: () => obs.test.get() && obs.test2.get(),
                set: ({ value }) => {
                    obs.test.set(value);
                    obs.test2.set(value);
                },
            }),
        );
        comp.set(true);

        expect(obs.test.get()).toEqual(true);
    });
    test('Computed set works before loaded', async () => {
        let setValue: number | undefined = undefined;
        let getValue: number | undefined = undefined;
        const comp = observable(
            linked({
                set: ({ value }) => {
                    setValue = value;
                },
                get: () =>
                    new Promise<number>((resolve) =>
                        setTimeout(() => {
                            getValue = 1;
                            resolve(1);
                        }, 0),
                    ),
            }),
        );
        comp.set(2);
        await promiseTimeout(0);
        expect(getValue).toEqual(1);
        expect(setValue).toEqual(2);
    });
    test('Computed handler is batched', () => {
        const obs = observable(
            linked({
                set: ({ value }) => {
                    expect(value.test).toEqual(true);
                    expect(value.test2).toEqual(true);
                },
                get: () => ({
                    test: false,
                    test2: false,
                }),
            }),
        );
        batch(() => {
            obs.test.set(true);
            obs.test2.set(true);
        });
    });
    test('Computed has onChange before activation', () => {
        const obs = observable({
            test: false,
            test2: () => obs.test.get(),
        });

        let lastValue = obs.test.peek();

        obs.test2.onChange(({ value }) => {
            lastValue = value;
        });

        expect(lastValue).toEqual(false);
        obs.test.set(true);
        expect(lastValue).toEqual(true);
    });
    test('Set child of computed', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable(
            linked({
                set: ({ value: { computedValue } }) => {
                    obs.test.set(computedValue);
                    obs.test2.set(computedValue);
                },
                get: () => ({ computedValue: obs.test.get() && obs.test2.get() }),
            }),
        );
        expect(comp.get()).toEqual({ computedValue: false });
        comp.computedValue.set(true);
        expect(comp.get()).toEqual({ computedValue: true });
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
    test('Computed activates before set', () => {
        const obs = observable({ test: false, test2: false });
        const comp = observable(
            linked({
                set: ({ value: { computedValue } }) => {
                    obs.test.set(computedValue);
                },
                get: () => ({
                    computedValue: obs.test.get(),
                    computedValue2: obs.test2.get(),
                }),
            }),
        );
        comp.computedValue.set(true);
        expect(comp.get()).toEqual({ computedValue: true, computedValue2: false });
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(false);
    });
    test('Computed activates when undefined', () => {
        const obs = observable<boolean[]>(undefined as unknown as boolean[]);
        const comp = observable(() => {
            return obs.get()?.filter((a) => !!a);
        });
        let observed: boolean[];
        observe(() => {
            observed = comp.get();
        });
        expect(observed!).toEqual(undefined);
        obs.set([]);
        expect(observed!).toEqual([]);
    });
    test('Two way computed value is set before calling setter', () => {
        const obs = observable(0);

        const comp = observable<string>(
            linked({
                set: ({ value }) => {
                    obs.set(+value);
                },
                get: () => {
                    return obs.get() + '';
                },
            }),
        );

        const increment = (cur: number) => {
            beginBatch();
            comp.set(cur + '');

            expect(obs.get()).toEqual(cur);
            expect(comp.get()).toEqual(cur + '');

            endBatch();
        };

        // It previously failed with just 2 but let's have a few extra just in case
        increment(1);
        increment(2);
        increment(2);
        increment(3);
        increment(4);
    });
    test('Computed values are set correctly while in batch', () => {
        const obs = observable(0);

        const comp = observable(() => obs.get() + 'A');

        // First get activates it
        expect(comp.get()).toEqual('0A');

        beginBatch();
        obs.set(1);
        expect(comp.get()).toEqual('1A');
        endBatch();
    });
    test('Computed values are set correctly while in batch nested', () => {
        const obs = observable(0);

        const comp = observable(() => obs.get() + 'A');
        const comp2 = observable(() => comp.get() + 'B');
        const comp3 = observable(() => comp2.get() + 'C');

        const handler = expectChangeHandler(obs);
        const handler3 = expectChangeHandler(comp3);

        // First get activates it
        expect(comp.get()).toEqual('0A');
        expect(comp2.get()).toEqual('0AB');
        expect(comp3.get()).toEqual('0ABC');

        beginBatch();
        obs.set(1);
        expect(comp.get()).toEqual('1A');
        expect(comp2.get()).toEqual('1AB');
        expect(comp3.get()).toEqual('1ABC');
        // Callback should not have been called because it's still batching
        expect(handler).toHaveBeenCalledTimes(0);
        expect(handler3).toHaveBeenCalledTimes(0);

        endBatch();

        expect(handler).toHaveBeenCalledWith(1, 0, [
            {
                path: [],
                pathTypes: [],
                prevAtPath: 0,
                valueAtPath: 1,
            },
        ]);
        expect(handler3).toHaveBeenCalledWith('1ABC', '0ABC', [
            {
                path: [],
                pathTypes: [],
                prevAtPath: '0ABC',
                valueAtPath: '1ABC',
            },
        ]);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    test('Computed array sort', () => {
        const obs = observable({ 1: { t: 1 }, 2: { t: 2 } });
        const sort = observable(1);
        const comp = observable(() => {
            return Object.keys(obs.get()).sort((a, b) => (+a - +b) * sort.get());
        });
        const handler = expectChangeHandler(comp);

        expect(comp.get()).toEqual(['1', '2']);

        sort.set(-1);

        expect(handler).toHaveBeenCalledTimes(1);

        expect(comp.get()).toEqual(['2', '1']);
    });
    test('Computed runs once when batched', () => {
        const obs1 = observable(0);
        const obs2 = observable(0);
        let num = 0;

        const comp = observable(() => {
            num++;
            return obs1.get() + obs2.get();
        });

        // First get activates it
        observe(() => comp.get());
        expect(comp.get()).toEqual(0);

        batch(() => {
            obs1.set(1);
            obs2.set(1);
        });
        expect(num).toEqual(2);
    });
    test('Two way does not trigger itself', () => {
        const obs1 = observable(0);
        const obs2 = observable(0);
        let numGets = 0;
        let numSets = 0;

        const comp = observable(
            linked({
                get: () => {
                    numGets++;
                    return obs1.get() + obs2.get();
                },
                set({ value }) {
                    numSets++;
                    obs1.set(value);
                    obs2.set(value);
                },
            }),
        );
        expect(numGets).toEqual(0);
        expect(numSets).toEqual(0);

        // First get activates it
        expect(comp.get()).toEqual(0);
        expect(numGets).toEqual(1);
        expect(numSets).toEqual(0);

        obs1.set(1);

        expect(numGets).toEqual(2);
        expect(numSets).toEqual(0);

        obs2.set(1);

        expect(numGets).toEqual(3);
        expect(numSets).toEqual(0);

        comp.set(3);

        expect(numGets).toEqual(4);
        expect(numSets).toEqual(1);

        obs1.set(4);

        expect(numGets).toEqual(5);
        expect(numSets).toEqual(1);
    });
    test('Computed link to activated child sets to undefined after activating', async () => {
        const obs = observable({
            child: linked({
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            resolve('hi');
                        }, 0);
                    });
                },
            }),
            other: () => ({
                c: obs.child.get(),
            }),
        });

        expect(obs.child.get()).toEqual(undefined);
        expect(obs.other.c.get()).toEqual(undefined);
        expect(obs.get()).toEqual({ child: undefined, other: { c: undefined } });

        await promiseTimeout(0);

        expect(obs.child.get()).toEqual('hi');

        // TODO: Should not have to do this
        // expect(obs.other.c.get()).toEqual('hi');

        expect(obs.get()).toEqual({ child: 'hi', other: { c: 'hi' } });
    });
});
describe('Computed inside observable', () => {
    test('Computed in observable', () => {
        const obs = observable({
            text: 'hi',
            test: () => {
                return obs.text.get() + '!';
            },
        });
        expect(obs.test.get() === 'hi!');
    });
    test('Computed selected gets correct value', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            selected: undefined as unknown as string,
            selectedItem: () => obs.items[obs.selected.get()].get(),
        });
        expect(obs.selectedItem.get()).toEqual(undefined);
        obs.selected.set('test1');
        expect(obs.selectedItem.get()).toEqual({
            text: 'hi',
        });
        obs.selected.set('test2');
        expect(obs.selectedItem.get()).toEqual({
            text: 'hello',
        });
    });
    test('Computed returning an observable is linked to it', () => {
        type Item = { text: string };
        const obs = observable({
            items: { test1: { text: 'h' }, test2: { text: 'hello' } } as Record<string, Item>,
            selected: 'test1' as string,
            selectedItem: (): Observable<Item> => {
                return obs.items[obs.selected.get()];
            },
        });

        // Check that sets works before get is called
        obs.selectedItem.text.set('hi');

        const handlerItems = expectChangeHandler(obs.items);
        const handlerSelected = expectChangeHandler(obs.selected);
        const handlerItem = expectChangeHandler(obs.selectedItem);

        obs.selectedItem.text.set('hi!');
        expect(obs.selectedItem.get()).toEqual({
            text: 'hi!',
        });
        expect(obs.items.test1.get()).toEqual({
            text: 'hi!',
        });
        expect(handlerItems).toHaveBeenCalledWith(
            { test1: { text: 'hi!' }, test2: { text: 'hello' } },
            { test1: { text: 'hi' }, test2: { text: 'hello' } },
            [
                {
                    path: ['test1', 'text'],
                    pathTypes: ['object', 'object'],
                    prevAtPath: 'hi',
                    valueAtPath: 'hi!',
                },
            ],
        );
        expect(handlerItem).toHaveBeenCalledWith({ text: 'hi!' }, { text: 'hi' }, [
            {
                path: ['text'],
                pathTypes: ['object'],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
        expect(handlerSelected).not.toHaveBeenCalled();
        expect(handlerItem).toHaveBeenCalledTimes(1);

        obs.selected.set('test2');
        expect(handlerSelected).toHaveBeenCalledWith('test2', 'test1', [
            {
                path: [],
                pathTypes: [],
                prevAtPath: 'test1',
                valueAtPath: 'test2',
            },
        ]);
        expect(obs.selectedItem.get()).toEqual({
            text: 'hello',
        });
        expect(handlerItem).toHaveBeenCalledTimes(2);
        expect(handlerItem).toHaveBeenCalledWith({ text: 'hi!' }, { text: 'hi' }, [
            {
                path: ['text'],
                pathTypes: ['object'],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);

        obs.selectedItem.text.set('hello!');
        expect(obs.selectedItem.get()).toEqual({
            text: 'hello!',
        });
        expect(obs.items.test1.get()).toEqual({
            text: 'hi!',
        });
        expect(obs.items.test2.get()).toEqual({
            text: 'hello!',
        });

        expect(handlerSelected).toHaveBeenCalledTimes(1);
        expect(handlerItem).toHaveBeenCalledTimes(3);
        expect(handlerItem).toHaveBeenCalledWith({ text: 'hello!' }, { text: 'hello' }, [
            {
                path: ['text'],
                pathTypes: ['object'],
                prevAtPath: 'hello',
                valueAtPath: 'hello!',
            },
        ]);
    });
    test('Computed link activates when getting', () => {
        const obs = observable(1);
        const comp = observable(() => obs);

        expect(obs.get()).toEqual(1);
        expect(comp.get()).toEqual(1);

        comp.set(2);

        expect(obs.get()).toEqual(2);
        expect(comp.get()).toEqual(2);

        obs.set(3);

        expect(obs.get()).toEqual(3);
        expect(comp.get()).toEqual(3);
    });
    test('Computed link updates when changing', () => {
        const num$ = observable(0);
        const obs = observable(1);
        const comp = observable(() => (num$.get() > 0 ? obs : undefined));

        expect(comp.get()).toEqual(undefined);

        num$.set(1);

        expect(comp.get()).toEqual(1);
    });
    test('Computed link to child updates when changing', () => {
        const num$ = observable(0);
        const obs = observable({ name: 'hi' });
        const comp = observable(() => (num$.get() > 0 ? obs : undefined));

        expect(comp.name.get()).toEqual(undefined);

        num$.set(1);

        expect(comp.name.get()).toEqual('hi');
    });
    test('Computed link to link updates when changing', () => {
        const num$ = observable(0);
        const obs = observable('hi');
        const obs2 = observable(() => (num$.get() > 1 ? obs : 'b'));
        const comp = observable(() => (num$.get() > 0 ? obs2 : 'a'));

        expect(comp.get()).toEqual('a');

        num$.set(1);

        expect(comp.get()).toEqual('b');

        num$.set(2);

        expect(comp.get()).toEqual('hi');
    });
    test('Computed link to link updates when changing to other obs', () => {
        const num$ = observable(0);
        const obs = observable('hi');
        const obs2 = observable('hello');
        const obs3 = observable(() => (num$.get() > 1 ? obs : obs2));
        const comp = observable(() => (num$.get() > 0 ? obs3 : 'a'));

        expect(comp.get()).toEqual('a');

        num$.set(1);

        expect(comp.get()).toEqual('hello');

        num$.set(2);

        expect(comp.get()).toEqual('hi');

        obs.set('hi2');
        expect(comp.get()).toEqual('hi2');

        obs2.set('hello2');
        expect(comp.get()).toEqual('hi2');
    });
    test('Computed link to activated updates when changing', async () => {
        const num$ = observable(0);
        const obs = observable(
            linked({
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            resolve('hi');
                        }, 0);
                    });
                },
            }),
        );
        const comp = observable(() => (num$.get() > 0 ? obs : undefined));

        expect(comp.get()).toEqual(undefined);

        num$.set(1);
        // Get it again because it's not observed
        expect(comp.get()).toEqual(undefined);

        await promiseTimeout(10);

        expect(comp.get()).toEqual('hi');
    });
    test('Computed link to link to activated updates when changing', async () => {
        const num$ = observable(0);
        const obs = observable(
            linked({
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            resolve('hi');
                        }, 0);
                    });
                },
            }),
        );
        const obs2 = observable(() => num$.get() > 1 && obs);
        const comp = observable(() => (num$.get() > 0 ? obs2 : undefined));

        expect(comp.get()).toEqual(undefined);

        num$.set(1);

        expect(comp.get()).toEqual(false);

        num$.set(2);

        await promiseTimeout(0);

        expect(comp.get()).toEqual('hi');
    });
    test('Computed link to link to activated child updates when changing', async () => {
        const num$ = observable(0);
        const obs = observable({
            test: linked({
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            resolve('hi');
                        }, 0);
                    });
                },
            }),
        });
        // TODO Is it calling these twice?
        const obs2 = observable(() => {
            return { test1: num$.get() > 1 ? obs.test : 'b' };
        });
        const comp = observable<{ test1: string | boolean }>(() => {
            return num$.get() > 0 ? obs2 : (undefined as any);
        });

        expect(comp.test1.get()).toEqual(undefined);

        num$.set(1);

        expect(comp.test1.get()).toEqual('b');

        num$.set(2);

        await promiseTimeout(10);

        expect(comp.test1.get()).toEqual('hi');
    });
    test('Computed link works with promise', async () => {
        const obs$ = observable({ a: 'hi', b: 'hello' });
        const linker$ = observable(() => {
            return new Promise<Observable<string>>((resolve) => {
                setTimeout(() => {
                    resolve(obs$.b);
                }, 0);
            });
        });
        expect(linker$.get()).toEqual(undefined);

        await when(linker$);

        expect(linker$.get()).toEqual('hello');

        // TODO Observe it and it should work
    });
    test('Computed link works with activated promise', async () => {
        const obs$ = observable({
            a: 'hi',
            b: linked({
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => {
                            resolve('hello');
                        }, 0);
                    });
                },
            }),
        });
        const linker$ = observable(
            linked({
                get: () => {
                    return new Promise<Observable<string>>((resolve) => {
                        setTimeout(() => {
                            resolve(obs$.b as any);
                        }, 0);
                    });
                },
            }),
        );
        // expect(linker$.get()).toEqual(undefined);

        await when(linker$);

        expect(linker$.get()).toEqual('hello');

        // TODO Observe it and it should work
    });
    test('Computed in observable sets raw data', () => {
        const obs = observable({
            text: 'hi',
            test: () => {
                return obs.text.get() + '!';
            },
        });

        expect(obs.test.get()).toEqual('hi!');
        expect(obs.get().test).toEqual('hi!');
        expect(isObservable(obs.get().test)).toBe(false);
    });
    test('Observable in observable as link sets raw data', () => {
        const obs = observable({
            text: 'hi',
            test: () =>
                observable((): string => {
                    return obs.text.get() + '!';
                }),
        });

        expect(obs.test.get()).toEqual('hi!');
        expect(obs.get().test).toEqual('hi!');
        expect(isObservable(obs.get().test)).toBe(false);
    });
    test('Observable in observable sets raw data', () => {
        const obs = observable({
            text: 'hi',
            test: observable('hi!'),
        });

        expect(obs.test.get()).toEqual('hi!');
        expect(obs.get().test).toEqual('hi!');
        expect(isObservable(obs.get().test)).toBe(false);
    });
    test('Computed in observable not activated by accessing root', () => {
        const obs = observable({
            text: 'hi',
            test: (): string => {
                return obs.text.get() + '!';
            },
        });
        const value = obs.get();
        expect(isObservable(value.test)).toBe(false);
        expect(value.test === undefined);
    });
    test('Child of computed with activated', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable({ sum: linked({ get: () => obs.test.get() + obs.test2.get() }) });
        expect(comp.sum.get()).toEqual(30);
    });
    test('Computed in observable notifies to root', () => {
        let num = 0;
        const obs = observable({
            text: 'hi',
            test: (): string => {
                num++;
                return obs.text.get() + '!';
            },
        });
        obs.test.get();
        expect(num).toEqual(1);
        const handler = expectChangeHandler(obs);
        obs.text.set('hello');
        expect(num).toEqual(2);
        expect(handler).toHaveBeenCalledWith({ text: 'hello', test: 'hello!' }, { text: 'hi', test: 'hi!' }, [
            {
                path: ['text'],
                pathTypes: ['object'],
                prevAtPath: 'hi',
                valueAtPath: 'hello',
            },
            {
                path: ['test'],
                pathTypes: ['object'],
                prevAtPath: 'hi!',
                valueAtPath: 'hello!',
            },
        ]);
    });
    test('Accessing through link goes to computed and not parent object', () => {
        const test = (): { child: string } => {
            return { child: obs.text.get() + '!' };
        };
        const obs = observable({
            text: 'hi',
            test,
        });
        const handler = expectChangeHandler(obs.test.child);
        const handler2 = expectChangeHandler(obs.test);
        const handlerRoot = expectChangeHandler(obs);
        obs.text.set('hello');
        expect(handler).toHaveBeenCalledWith('hello!', 'hi!', [
            {
                path: [],
                pathTypes: [],
                prevAtPath: 'hi!',
                valueAtPath: 'hello!',
            },
        ]);
        expect(handler2).toHaveBeenCalledWith({ child: 'hello!' }, { child: 'hi!' }, [
            {
                path: [],
                pathTypes: [],
                prevAtPath: { child: 'hi!' },
                valueAtPath: { child: 'hello!' },
            },
        ]);
        expect(handlerRoot).toHaveBeenCalledWith(
            { text: 'hello', test: { child: 'hello!' } },
            { text: 'hi', test: { child: 'hi!' } },
            [
                {
                    path: ['text'],
                    pathTypes: ['object'],
                    prevAtPath: 'hi',
                    valueAtPath: 'hello',
                },
                {
                    path: ['test', 'child'],
                    pathTypes: ['object', 'object'],
                    prevAtPath: 'hi!',
                    valueAtPath: 'hello!',
                },
                // TODO: Is this wrong? Should there not be 3 changes here?
                {
                    path: ['test'],
                    pathTypes: ['object'],
                    prevAtPath: { child: 'hi!' },
                    valueAtPath: { child: 'hello!' },
                },
            ],
        );
    });
    test('observe sub computed runs twice', () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: () => sub$.get(),
        });

        let num = 0;
        observe(() => {
            obs$.sub.get();
            num++;
        });

        expect(num).toEqual(1);
    });
    test('observe sub computed runs once if already activated', () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: () => sub$.get(),
        });

        let num = 0;
        obs$.sub.get();
        observe(() => {
            obs$.sub.get();
            num++;
        });

        expect(num).toEqual(1);
    });
    test('observe sub computed runs once if already activated as child', () => {
        const obs$ = observable({
            num: 0,
            sub: () => obs$.num.get(),
        });

        let num = 0;
        obs$.sub.get();
        observe(() => {
            obs$.sub.get();
            num++;
        });

        expect(num).toEqual(1);
    });
    test('Setting through two-way sets values on parent', () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: linked({
                set: ({ value }) => {
                    sub$.set(value);
                },
                get: () => sub$.get(),
            }),
        });

        // This only works if sub is activated
        obs$.sub.get();

        let observedValue;
        observe(() => {
            observedValue = obs$.get();
        });

        expect(observedValue).toEqual({ sub: { num: 0 } });

        obs$.sub.set({ num: 4 });

        expect(observedValue).toEqual({ sub: { num: 4 } });
        expect(obs$.get()).toEqual({ sub: { num: 4 } });

        obs$.sub.set({ num: 8 });

        expect(observedValue).toEqual({ sub: { num: 8 } });
        expect(obs$.get()).toEqual({ sub: { num: 8 } });
    });
    test('linked observable sets value on parent', () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: () => sub$,
        });

        // This only works if activated first
        obs$.sub.get();

        expect(obs$.get()).toEqual({ sub: { num: 0 } });

        obs$.sub.num.set(4);

        let observedValue;
        observe(() => {
            observedValue = obs$.get();
        });

        expect(observedValue).toEqual({ sub: { num: 4 } });
        expect(obs$.get()).toEqual({ sub: { num: 4 } });
    });
});
describe('lookup', () => {
    test('lookup basic', async () => {
        const obs = observable((key: string) => 'proxied_' + key);
        expect(obs.test.get()).toEqual('proxied_test');
    });
    test('lookup is not called with undefined key', async () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: (key: string): Observable<string> => {
                expect(typeof key).toEqual('string');
                return obs.items[key].text;
            },
        });
        expect(obs.itemText['test1'].get()).toEqual('hi');
    });
    test('lookup basic as child', async () => {
        const obs = observable<{ child: Record<string, string> }>({
            child: (key: string) => 'proxied_' + key,
        });
        expect(obs.child.test.get()).toEqual('proxied_test');

        const obs2 = observable<{ child: Record<string, { child2: string }> }>({
            child: (key: string) => ({ child2: 'proxied_' + key }),
        });
        expect(obs.child.test.get()).toEqual('proxied_test');
        expect(obs2.child.test.child2.get()).toEqual('proxied_test');
    });
    test('lookup plain', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
        });
        const itemText = observable((key: string) => obs.items[key].text.get());
        expect(itemText['test1'].get()).toEqual('hi');

        const handlerItem = expectChangeHandler(obs.items['test1']);
        const handlerItemText = expectChangeHandler(itemText['test1']);

        obs.items['test1'].text.set('hi!');
        expect(obs.items['test1'].text.get()).toEqual('hi!');
        expect(itemText['test1'].get()).toEqual('hi!');

        expect(handlerItem).toHaveBeenCalledWith({ text: 'hi!' }, { text: 'hi' }, [
            {
                path: ['text'],
                pathTypes: ['object'],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
        expect(handlerItemText).toHaveBeenCalledWith('hi!', 'hi', [
            {
                path: [],
                pathTypes: [],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
    });
    test('lookup two-way', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
        });
        const itemText = observable((key: string) =>
            linked({
                set: ({ value }) => {
                    obs.items[key].text.set(value);
                },
                get: () => {
                    return obs.items[key].text.get();
                },
            }),
        );
        itemText['test1'].get();
        expect(itemText['test1'].get()).toEqual('hi');

        const handlerItem = expectChangeHandler(obs.items['test1']);
        const handlerItemText = expectChangeHandler(itemText['test1']);

        itemText['test1'].set('hi!');
        expect(obs.items['test1'].text.get()).toEqual('hi!');

        expect(handlerItem).toHaveBeenCalledWith({ text: 'hi!' }, { text: 'hi' }, [
            {
                path: ['text'],
                pathTypes: ['object'],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
        expect(handlerItemText).toHaveBeenCalledWith('hi!', 'hi', [
            {
                path: [],
                pathTypes: [],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
    });
    test('lookup link', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: (key: string): Observable<string> => {
                return obs.items[key].text;
            },
        });

        expect(obs.itemText['test1'].get()).toEqual('hi');

        const handlerItem = expectChangeHandler(obs.items['test1']);
        const handlerItemText = expectChangeHandler(obs.itemText['test1']);

        obs.itemText['test1'].set('hi!');
        expect(obs.items['test1'].text.get()).toEqual('hi!');

        expect(handlerItem).toHaveBeenCalledWith({ text: 'hi!' }, { text: 'hi' }, [
            {
                path: ['text'],
                pathTypes: ['object'],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
        expect(handlerItemText).toHaveBeenCalledWith('hi!', 'hi', [
            {
                path: [],
                pathTypes: [],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
    });
    test('lookup link with a get()', () => {
        const obs = observable({
            selector: 'text',
            items: {
                test1: { text: 'hi', othertext: 'bye' },
                test2: { text: 'hello', othertext: 'goodbye' },
            } as Record<string, Record<string, string>>,
            itemText: (key: string): Observable<string> => obs.items[key][obs.selector.get()],
        });
        expect(obs.itemText['test1'].get()).toEqual('hi');

        const handlerItem = expectChangeHandler(obs.items['test1']);
        const handlerItemText = expectChangeHandler(obs.itemText['test1']);

        obs.selector.set('othertext');

        expect(obs.itemText['test1'].get()).toEqual('bye');

        expect(handlerItem).not.toHaveBeenCalled();

        expect(handlerItemText).toHaveBeenCalledWith('bye', 'hi', [
            {
                path: [],
                pathTypes: [],
                prevAtPath: 'hi',
                valueAtPath: 'bye',
            },
        ]);
    });
    test('lookup into child', () => {
        const obs = observable({
            selector: 'text',
            items: {
                test1: { text: 'hi', othertext: 'bye' },
                test2: { text: 'hello', othertext: 'goodbye' },
            } as Record<string, Record<string, string>>,
            itemLink: (key: string): Observable<Record<string, string>> => obs.items[key],
        });
        expect(obs.itemLink['test1'].text.get()).toEqual('hi');
    });
    test('lookup into child with undefined key', () => {
        const obs = observable({
            items: linked({
                get: () =>
                    ({
                        test1: { text: 'hi', othertext: 'bye' },
                        test2: { text: 'hello', othertext: 'goodbye' },
                    }) as Record<string, Record<string, string>>,
            }),
            itemLink: (key: string): Observable<string> => {
                return obs.items[key].text;
            },
        });
        expect(obs.itemLink[undefined as any].get()).toEqual(undefined);
    });
    test('lookup into lookup', () => {
        const obs = observable({
            team: (teamID: string) => ({
                profile: linked({
                    get: () => {
                        return { username: teamID + ' name' };
                    },
                }),
            }),
        });
        expect(obs.team['asdf'].profile.username.get()).toEqual('asdf name');
        expect(obs.team[undefined as any].profile.username.get()).toEqual('undefined name');
        // expect(d).toEqual('asdf name');
    });
    test('observable link into lookup', () => {
        const obs = observable({
            link: () => obs.team['asdf'],
            team: (teamID: string) => ({
                profile: linked({
                    get: () => {
                        return { username: teamID + ' name' };
                    },
                }),
            }),
        });
        expect(obs.link.profile.username.get()).toEqual('asdf name');
    });
    test('raw value of lookup has all values', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: (key: string): Observable<string> => obs.items[key].text,
        });
        expect(obs.get().items).toEqual({
            test1: { text: 'hi' },
            test2: { text: 'hello' },
        });

        obs.itemText['test1'].set('hi!');
        obs.itemText['test1'].get();

        expect(obs.get()).toEqual({
            items: { test1: { text: 'hi!' }, test2: { text: 'hello' } },
            itemText: {
                test1: 'hi!',
            },
        });

        obs.itemText['test2'].set('hello!');

        expect(obs.get()).toEqual({
            items: { test1: { text: 'hi!' }, test2: { text: 'hello!' } },
            itemText: {
                test1: 'hi!',
                test2: 'hello!',
            },
        });
    });
    test('listener on lookup works', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: (key: string): Observable<string> => {
                return obs.items[key].text;
            },
        });
        obs.itemText['test1'].get();
        const handler = expectChangeHandler(obs);
        const handler2 = expectChangeHandler(obs.itemText);

        obs.itemText['test1'].set('hi!');

        expect(handler).toHaveBeenCalledWith(
            {
                items: { test1: { text: 'hi!' }, test2: { text: 'hello' } },
                itemText: {
                    test1: 'hi!',
                },
            },
            {
                items: { test1: { text: 'hi' }, test2: { text: 'hello' } },
                itemText: {
                    test1: 'hi',
                },
            },
            [
                {
                    path: ['itemText', 'test1'],
                    pathTypes: ['object', 'object'],
                    prevAtPath: 'hi',
                    valueAtPath: 'hi!',
                },
                {
                    path: ['items', 'test1', 'text'],
                    pathTypes: ['object', 'object', 'object'],
                    prevAtPath: 'hi',
                    valueAtPath: 'hi!',
                },
            ],
        );
        expect(handler2).toHaveBeenCalledWith({ test1: 'hi!' }, { test1: 'hi' }, [
            {
                path: ['test1'],
                pathTypes: ['object'],
                prevAtPath: 'hi',
                valueAtPath: 'hi!',
            },
        ]);
    });
    test('get root of lookup is just function until a child is activated', async () => {
        const fn = (key: string) => 'proxied_' + key;
        const obs = observable(fn);
        expect(obs.get()).toEqual(fn);

        expect(obs.test.get()).toEqual('proxied_test');
        expect(obs.get()).toEqual({ test: 'proxied_test' });
    });
});

describe('loading', () => {
    test('isLoaded', async () => {
        const obs = observable(() => {
            return new Promise<string>((resolve) => {
                setTimeout(() => resolve('hi there'), 0);
            });
        });
        expect(obs.get()).toEqual(undefined);
        const state = syncState(obs);
        expect(state.isLoaded.get()).toEqual(false);
        await promiseTimeout(0);
        expect(state.isLoaded.get()).toEqual(true);
        expect(obs.get()).toEqual('hi there');
    });
    test('isLoaded with activated', async () => {
        const obs = observable(
            linked({
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => resolve('hi there'), 0);
                    });
                },
                initial: 'initial',
            }),
        );
        expect(obs.get()).toEqual(undefined);
        const state = syncState(obs);
        expect(state.isLoaded.get()).toEqual(false);
        await promiseTimeout(0);
        expect(state.isLoaded.get()).toEqual(true);
        expect(obs.get()).toEqual('hi there');
    });
    test('isLoaded with activated and second param', async () => {
        const obs = observable(
            linked(
                {
                    get: () => {
                        return new Promise<string>((resolve) => {
                            setTimeout(() => resolve('hi there'), 0);
                        });
                    },
                },
                {
                    initial: 'initial',
                },
            ),
        );
        expect(obs.get()).toEqual(undefined);
        const state = syncState(obs);
        expect(state.isLoaded.get()).toEqual(false);
        await promiseTimeout(0);
        expect(state.isLoaded.get()).toEqual(true);
        expect(obs.get()).toEqual('hi there');
    });
});
describe('async', () => {
    test('set does not get called by load', async () => {
        let didSet = false;
        const obs = observable(
            linked({
                get: () => {
                    return new Promise<string>((resolve) => {
                        setTimeout(() => resolve('hi there'), 0);
                    });
                },
                set: () => {
                    didSet = true;
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);
        await promiseTimeout(0);
        expect(obs.get()).toEqual('hi there');

        expect(didSet).toEqual(false);

        obs.set('hello');

        await promiseTimeout(0);

        expect(didSet).toEqual(true);
    });
    test('get returning twice', async () => {
        const num$ = observable(0);
        const obs = observable(
            linked({
                get: (): Promise<string> | string =>
                    num$.get() > 0
                        ? new Promise<string>((resolve) => {
                              setTimeout(() => {
                                  resolve('hi');
                              }, 0);
                          })
                        : '',
            }),
        );
        const handler = expectChangeHandler(obs);
        expect(obs.get()).toEqual('');
        num$.set(1);
        await promiseTimeout(0);
        expect(obs.get()).toEqual('hi');
        expect(handler).toHaveBeenCalledWith('hi', '', [
            { path: [], pathTypes: [], prevAtPath: '', valueAtPath: 'hi' },
        ]);
    });
});
describe('Order of get/set', () => {
    test('set after get', async () => {
        const num$ = observable(0);
        const obs$ = observable(
            linked({
                get: async (): Promise<string> => {
                    const num = num$.get();
                    return promiseTimeout(0, 'hi' + num);
                },
            }),
        );
        let lastObserved;
        observe(() => {
            lastObserved = obs$.get();
        });
        expect(lastObserved).toEqual(undefined);
        obs$.set('hello');
        expect(lastObserved).toEqual('hello');
        await promiseTimeout(0);
        expect(lastObserved).toEqual('hi0');
        num$.set(1);
        await promiseTimeout(0);
        expect(lastObserved).toEqual('hi1');
    });
    test('get runs twice and second finishes first', async () => {
        const delay$ = observable(5);
        const obs$ = observable(
            linked({
                get: async (): Promise<string> => {
                    const delay = delay$.get();
                    const val = await promiseTimeout(delay, 'hi' + delay);
                    return val;
                },
            }),
        );
        let lastObserved;
        observe(() => {
            lastObserved = obs$.get();
        });
        delay$.set(0);
        expect(lastObserved).toEqual(undefined);
        await promiseTimeout(0);
        expect(lastObserved).toEqual('hi0');
        await promiseTimeout(10);
        // Should keep the value from the second run and ignore the first
        expect(lastObserved).toEqual('hi0');
    });
    test('synced get runs twice and second finishes first', async () => {
        const delay$ = observable(5);
        const obs$ = observable(
            synced({
                get: async (): Promise<string> => {
                    const delay = delay$.get();
                    const val = await promiseTimeout(delay, 'hi' + delay);
                    return val;
                },
            }),
        );
        let lastObserved;
        observe(() => {
            lastObserved = obs$.get();
        });
        delay$.set(0);
        expect(lastObserved).toEqual(undefined);
        await promiseTimeout(0);
        expect(lastObserved).toEqual('hi0');
        await promiseTimeout(10);
        // Should keep the value from the second run and ignore the first
        expect(lastObserved).toEqual('hi0');
    });
});
describe('Set after', () => {
    test('Basic computed set after', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable();
        comp.set(() => obs.test.get() + obs.test2.get());
        expect(comp.get()).toEqual(30);
    });
    test('Basic computed set after with child', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable<{ child: number }>();
        comp.set({ child: () => obs.test.get() + obs.test2.get() });
        expect(comp.child.get()).toEqual(30);
    });
    test('Set with child direct link', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable<{ child: number }>();
        comp.set({ child: obs.test });
        expect(comp.child.get()).toEqual(10);
    });
    test('Basic computed set after with activated child', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable<{ child: number }>();
        comp.set({ child: linked({ get: () => obs.test.get() + obs.test2.get() }) });
        expect(comp.child.get()).toEqual(30);
    });
    test('Computed assigned later', () => {
        const obs = observable({ text: 'hi' } as { text: any; test: any });
        obs.assign({
            test: () => obs.text.get() + '!',
        });
        expect(obs.test.get() === 'hi!');
    });
    test('Computed assigned later nodes are the same', () => {
        const obs = observable({ text: 'hi' } as { text: any; test: any });
        const test$ = obs.test;
        obs.assign({
            test: () => obs.text.get() + '!',
        });
        obs.test.get();
        const test2$ = obs.test;
        expect(test$ === test2$).toEqual(true);
    });
});
describe('Link directly', () => {
    test('Set a direct link', () => {
        const obs = observable({
            test: 10,
            test2: () => ({
                a: 20,
                b: obs.test,
            }),
        });
        obs.test2.get();
        const handler = expectChangeHandler(obs.test2.b);
        const handler2 = expectChangeHandler(obs.test2);

        expect(obs.test2.b.get()).toEqual(10);
        obs.test.set(30);
        expect(obs.test2.b.get()).toEqual(30);
        expect(handler).toHaveBeenCalledWith(30, 10, [{ path: [], pathTypes: [], valueAtPath: 30, prevAtPath: 10 }]);
        expect(handler2).toHaveBeenCalledWith({ a: 20, b: 30 }, { a: 20, b: 10 }, [
            { path: ['b'], pathTypes: ['object'], valueAtPath: 30, prevAtPath: 10 },
        ]);
    });
    test('Observable link to observable', () => {
        const obs = observable({
            test: 10,
            test2: observable((): Observable<number> => obs.test),
        });
        // obs.test2.get();
        const handler = expectChangeHandler(obs.test);
        const handler2 = expectChangeHandler(obs.test2);

        obs.test.set(30);
        expect(obs.test2.get()).toEqual(30);
        expect(handler).toHaveBeenCalledWith(30, 10, [{ path: [], pathTypes: [], valueAtPath: 30, prevAtPath: 10 }]);
        expect(handler2).toHaveBeenCalledWith(30, 10, [{ path: [], pathTypes: [], valueAtPath: 30, prevAtPath: 10 }]);

        obs.test2.set(50);
        expect(obs.test.get()).toEqual(50);
        expect(obs.test2.get()).toEqual(50);
        expect(handler).toHaveBeenCalledWith(50, 30, [{ path: [], pathTypes: [], valueAtPath: 50, prevAtPath: 30 }]);
        expect(handler2).toHaveBeenCalledWith(50, 30, [{ path: [], pathTypes: [], valueAtPath: 50, prevAtPath: 30 }]);
    });
    test('Observable link to observable object', () => {
        const obs = observable({
            test: { num: 10 },
            test2: observable((): Observable<{ num: number }> => obs.test),
        });
        const handler = expectChangeHandler(obs.test);
        const handler2 = expectChangeHandler(obs.test2);

        obs.test2.num.set(30);
        expect(obs.test2.get()).toEqual({ num: 30 });
        expect(handler).toHaveBeenCalledWith({ num: 30 }, { num: 10 }, [
            { path: ['num'], pathTypes: ['object'], valueAtPath: 30, prevAtPath: 10 },
        ]);
        expect(handler2).toHaveBeenCalledWith({ num: 30 }, { num: 10 }, [
            { path: ['num'], pathTypes: ['object'], valueAtPath: 30, prevAtPath: 10 },
        ]);

        obs.test2.num.set(50);
        expect(obs.test2.get()).toEqual({ num: 50 });
        expect(handler).toHaveBeenCalledWith({ num: 50 }, { num: 30 }, [
            { path: ['num'], pathTypes: ['object'], valueAtPath: 50, prevAtPath: 30 },
        ]);
        expect(handler2).toHaveBeenCalledWith({ num: 50 }, { num: 30 }, [
            { path: ['num'], pathTypes: ['object'], valueAtPath: 50, prevAtPath: 30 },
        ]);
    });
    test('Direct link in constructor', () => {
        const obs = observable('hi');
        const obs2 = observable(obs);
        expect(obs2.get()).toEqual('hi');
    });
    test('Set a child of an object of direct links', () => {
        const obs$ = observable({ key1: 'hi', key2: 'hi2' });
        const obs2$ = observable(() => ({ key1: obs$.key1 }));
        obs2$.key1.set('hi1');
        expect(obs$.get()).toEqual({ key1: 'hi1', key2: 'hi2' });
    });
    test('Delete child of a direct link', () => {
        const obs = observable({ key1: 'hi', key2: 'hi2' });
        const obs2 = observable(obs);
        obs2.key1.delete();
        expect(obs.get()).toEqual({ key2: 'hi2' });
    });
    test('Delete a direct link', () => {
        const obs = observable({ key1: 'hi', key2: 'hi2' });
        const obs2 = observable(() => obs.key1);
        obs2.delete();
        expect(obs.get()).toEqual({ key2: 'hi2' });
    });
    test('Delete a child of an object of direct links', () => {
        const obs$ = observable({ key1: 'hi', key2: 'hi2' });
        const obs2$ = observable(() => ({ key1: obs$.key1 }));
        obs2$.key1.delete();
        expect(obs$.get()).toEqual({ key2: 'hi2' });
    });
    test('link in array', () => {
        interface Estimation {
            id: string;
            name: string;
        }

        interface AppState {
            estimations: Estimation[];
            estimationIdSelected: string;
            estimationSelected: Estimation;
        }
        const appState$ = observable<AppState>({
            estimations: [],
            estimationIdSelected: '',
            estimationSelected: () => {
                return appState$.estimations.find((e) => {
                    return e.id.get() === appState$.estimationIdSelected.get();
                });
            },
        });

        let nextId = 0;
        const addEstimation = () => {
            const id = nextId++ + '';
            appState$.estimations.push({ id, name: id });
        };

        const deleteEstimation = (estimationId: string) => {
            const index = appState$.estimations.findIndex((e) => e.id.peek() === estimationId);
            batch(() => {
                appState$.estimations[index].delete();
                appState$.estimationIdSelected.set('');
            });
        };

        let lastSelected: string | undefined = undefined;
        observe(() => {
            const val = appState$.estimationSelected.name.get();
            lastSelected = val;
        });

        expect(lastSelected).toEqual(undefined);

        addEstimation();
        addEstimation();

        expect(lastSelected).toEqual(undefined);

        appState$.estimationIdSelected.set('0');

        expect(lastSelected).toEqual('0');

        batch(() => {
            deleteEstimation('0');
            appState$.estimationIdSelected.set('');
        });

        expect(lastSelected).toEqual(undefined);
    });
});
describe('Complex computeds', () => {
    test('Computed returning a link as child', () => {
        const obs = observable({
            test: 10,
            test2: () => ({
                a: 20,
                b: () => obs.test,
            }),
        });
        const handler = expectChangeHandler(obs.test2.b);

        expect(obs.test2.b.get()).toEqual(10);
        obs.test.set(30);
        expect(obs.test2.b.get()).toEqual(30);
        expect(handler).toHaveBeenCalledWith(30, 10, [{ path: [], pathTypes: [], valueAtPath: 30, prevAtPath: 10 }]);
    });
    test('Computed returning an array of links changing one', () => {
        const obs = observable<Record<string, { id: string; text: string }>>({
            a: { id: 'a', text: 'hia' },
            b: { id: 'b', text: 'hib' },
        });

        const comp = observable(() => Object.keys(obs.get()).map((key) => () => obs[key]));

        expect(comp[0].get()).toEqual({ id: 'a', text: 'hia' });
        obs.a.text.set('hia!');
        expect(comp[0].get()).toEqual({ id: 'a', text: 'hia!' });
    });
    test('Computed returning an object of links', () => {
        const obs = observable<Record<string, { id: string; text: string }>>({
            a: { id: 'a', text: 'hia' },
            b: { id: 'b', text: 'hib' },
            c: { id: 'c', text: 'hic' },
        });

        let num = 0;

        const comp = observable(() => {
            obs.get();
            return {
                a: () => obs.a,
                b: () => (num > 0 ? obs.c : obs.b),
            };
        });

        expect(comp.a.get()).toEqual({ id: 'a', text: 'hia' });
        expect(comp.b.get()).toEqual({ id: 'b', text: 'hib' });

        num++;
        obs.a.delete();
        expect(comp.b.get()).toEqual({ id: 'c', text: 'hic' });
    });
    test('Computed returning an array of links with functions', () => {
        const obs = observable<Record<string, { id: string; text: string }>>({
            a: { id: 'a', text: 'hia' },
            b: { id: 'b', text: 'hib' },
        });

        const comp = observable(() => {
            const val = obs.get();
            return Object.keys(val).map((key) => () => {
                return obs[key];
            });
        });

        expect(comp[0].get()).toEqual({ id: 'a', text: 'hia' });

        obs.a.delete();
        expect(comp[0].get()).toEqual({ id: 'b', text: 'hib' });
    });
    test('Computed returning an array of links direct', () => {
        const obs = observable<Record<string, { id: string; text: string }>>({
            a: { id: 'a', text: 'hia' },
            b: { id: 'b', text: 'hib' },
        });

        const comp = observable(() => {
            const val = obs.get();
            return Object.keys(val).map((key) => {
                return obs[key];
            });
        });

        expect(comp[0].get()).toEqual({ id: 'a', text: 'hia' });

        obs.a.delete();
        expect(comp[0].get()).toEqual({ id: 'b', text: 'hib' });
    });
    test('Computed returning an array of links direct with looper', () => {
        const obs = observable<Record<string, { id: string; text: string }>>({
            a: { id: 'a', text: 'hia' },
            b: { id: 'b', text: 'hib' },
        });

        const comp = observable(() => {
            const val = obs.get();
            return Object.keys(val).map((key) => {
                return obs[key];
            });
        });

        const arr = comp.map((a) => a.get());

        expect(arr.length).toEqual(2);
        expect(arr[0]).toEqual({ id: 'a', text: 'hia' });
    });
    test('Computed returning an array of links direct with reduce', () => {
        const obs = observable<Record<string, { id: string; num: number }>>({
            a: { id: 'a', num: 1 },
            b: { id: 'b', num: 2 },
        });

        const comp = observable(() => {
            const val = obs.get();
            return Object.keys(val).map((key) => {
                return obs[key];
            });
        });

        const total = comp.reduce((acc, a: Observable<any>) => {
            return acc + a.num.get();
        }, 0);

        expect(total).toEqual(3);
    });
    test('Computed returning an array of links with Object.keys', () => {
        const obs = observable<Record<string, { id: string }>>(() => ({
            a: { id: 'a' },
            b: { id: 'b' },
        }));

        const keys$ = observable(() => {
            return Object.keys(obs);
        });

        const keys = keys$.get();

        expect(keys).toEqual(['a', 'b']);

        const values$ = observable(() => {
            return Object.values(obs);
        });

        const values = values$.map((child$) => child$.get());

        expect(values).toEqual([{ id: 'a' }, { id: 'b' }]);
    });
    // TODOCOMPUTED Known to not work, not sure if it should work
    // test('Computed returning an array of links direct and get array', () => {
    //     const obs = observable<Record<string, { id: string; text: string }>>({
    //         a: { id: 'a', text: 'hia' },
    //         b: { id: 'b', text: 'hib' },
    //     });

    //     const comp = observable(() => {
    //         const val = obs.get();
    //         return Object.keys(val).map((key) => {
    //             return obs[key];
    //         });
    //     });

    //     const arr = comp.get();

    //     expect(arr.length).toEqual(2);
    //     expect(arr[0]).toEqual({ id: 'a', text: 'hia' });
    // });
    test('Changing link target', () => {
        const state = observable({
            a: {
                prop1: 1,
                prop2: 2,
            },
            b: {
                prop1: 3,
                prop2: 4,
            },
        });

        const editingId = observable<'a' | 'b'>('a');
        const editingItem = observable(() => state[editingId.get()]);

        let prop1Num = 0;
        let prop1Value = 0;
        let prop2Num = 0;
        let prop2Value = 0;

        observe(() => {
            prop1Value = editingItem.prop1.get();
            prop1Num++;
        });

        observe(() => {
            prop2Value = editingItem.prop2.get();
            prop2Num++;
        });

        expect(prop1Num).toEqual(1);
        expect(prop1Value).toEqual(1);

        expect(prop2Num).toEqual(1);
        expect(prop2Value).toEqual(2);

        editingItem.prop2.set(5);

        expect(prop1Num).toEqual(1);
        expect(prop1Value).toEqual(1);

        expect(prop2Num).toEqual(2);
        expect(prop2Value).toEqual(5);

        editingId.set('b');

        expect(prop1Num).toEqual(2);
        expect(prop1Value).toEqual(3);

        expect(prop2Num).toEqual(3);
        expect(prop2Value).toEqual(4);
    });
    test('Changing link target with immediate', () => {
        // Note: This test is here because I was seeing different behavior if
        // there were immediate observers than without them
        const state = observable({
            a: {
                prop1: 1,
                prop2: 2,
            },
            b: {
                prop1: 3,
                prop2: 4,
            },
        });

        const editingId = observable<'a' | 'b'>('a');
        const editingItem = observable(() => state[editingId.get()]);

        let prop1CNum = 0;
        let prop1CValue = 0;
        let prop2CNum = 0;
        let prop2CValue = 0;
        let prop1Num = 0;
        let prop1Value = 0;
        let prop1NumImm = 0;
        let prop1ValueImm = 0;
        let prop2Num = 0;
        let prop2Value = 0;
        let prop2NumImm = 0;
        let prop2ValueImm = 0;

        editingItem.prop1.onChange(
            ({ value }) => {
                prop1CValue = value;
                prop1CNum++;
            },
            { initial: true },
        );
        editingItem.prop2.onChange(
            ({ value }) => {
                prop2CValue = value;
                prop2CNum++;
            },
            { initial: true },
        );

        observe(
            () => {
                prop1ValueImm = editingItem.prop1.get();
                prop1NumImm++;
            },
            { immediate: true },
        );
        observe(() => {
            prop1Value = editingItem.prop1.get();
            prop1Num++;
        });

        observe(
            () => {
                prop2ValueImm = editingItem.prop2.get();
                prop2NumImm++;
            },
            { immediate: true },
        );
        observe(() => {
            prop2Value = editingItem.prop2.get();
            prop2Num++;
        });

        expect(prop1Num).toEqual(1);
        expect(prop1NumImm).toEqual(1);
        expect(prop1CNum).toEqual(1);
        expect(prop1CValue).toEqual(1);
        expect(prop1Value).toEqual(1);
        expect(prop1ValueImm).toEqual(1);

        expect(prop2Num).toEqual(1);
        expect(prop2NumImm).toEqual(1);
        expect(prop2CNum).toEqual(1);
        expect(prop2CValue).toEqual(2);
        expect(prop2Value).toEqual(2);
        expect(prop2ValueImm).toEqual(2);

        editingItem.prop2.set(5);

        expect(prop1Num).toEqual(1);
        expect(prop1NumImm).toEqual(1);
        expect(prop1CNum).toEqual(1);
        expect(prop1CValue).toEqual(1);
        expect(prop1Value).toEqual(1);
        expect(prop1ValueImm).toEqual(1);

        expect(prop2CNum).toEqual(2);
        expect(prop2Num).toEqual(2);
        expect(prop2NumImm).toEqual(2);
        expect(prop2CValue).toEqual(5);
        expect(prop2Value).toEqual(5);
        expect(prop2ValueImm).toEqual(5);

        editingId.set('b');

        expect(prop1Num).toEqual(2);
        expect(prop1NumImm).toEqual(2);
        expect(prop1CNum).toEqual(2);
        expect(prop1CValue).toEqual(3);
        expect(prop1Value).toEqual(3);
        expect(prop1ValueImm).toEqual(3);

        expect(prop2CNum).toEqual(3);
        expect(prop2Num).toEqual(3);
        expect(prop2NumImm).toEqual(3);
        expect(prop2CValue).toEqual(4);
        expect(prop2Value).toEqual(4);
        expect(prop2ValueImm).toEqual(4);
    });
});
describe('Activation', () => {
    test('linked with function', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = observable(linked(() => obs.test.get() + obs.test2.get()));
        expect(comp.get()).toEqual(30);
    });
    test('Computed in observable gets activated by accessing root', () => {
        const obs = observable({
            text: 'hi',
            test: observable((): { text: string } => {
                return { text: obs.text.get() + '!' };
            }),
        });
        const value = obs.get();
        expect(isObservable(value.test)).toBe(false);
        expect(value.test.text === 'hi!').toBe(true);
    });
    test('Computed in array of observables gets activated by accessing root', () => {
        const obs = observable({
            text: 'hi',
            test: [
                observable((): { text: string } => {
                    return { text: obs.text.get() + '!' };
                }),
            ],
        });
        let value = obs.get();
        expect(isObservable(value.test[0])).toBe(false);
        expect(value.test[0].text === 'hi!').toBe(true);

        obs.test.set([
            observable((): { text: string } => {
                return { text: obs.text.get() + '!!!!' };
            }),
        ]);

        value = obs.get();
        expect(isObservable(value.test[0])).toBe(false);
        expect(value.test[0].text === 'hi!!!!').toBe(true);
    });
    test('Computed in observable with linked gets activated by accessing root', () => {
        let didCall = false;
        const obs = observable({
            text: 'hi',
            test: observable((): { text2: string; test2: number } => {
                return {
                    text2: obs.text.get() + '!',
                    test2: linked(() => {
                        didCall = true;
                        return 10;
                    }),
                };
            }),
        });
        const value = obs.get();
        expect(isObservable(value.test)).toBe(false);
        expect(value.test.text2).toEqual('hi!');
        expect(value.test.test2).toEqual(10);
        expect(didCall).toEqual(true);
    });
    test('Computed descendant in observable gets activated by accessing root', () => {
        const obs = observable({
            text: 'hi',
            child: {
                test: {
                    test2: observable((): { text: string } => {
                        return { text: obs.text.get() + '!' };
                    }),
                },
            },
        });
        const value = obs.get();
        expect(isObservable(value.child.test)).toBe(false);
        expect(isObservable(value.child.test.test2)).toBe(false);
        expect(value.child.test.test2.text === 'hi!').toBe(true);
    });
    test('Function in observable does not activate by accessing root', () => {
        const obs = observable({
            text: 'hi',
            test: () => {
                return { text: obs.text.get() + '!' };
            },
        });
        const value = obs.get();
        expect(isObservable(value.test)).toBe(false);
        expect(value.test.text === 'hi!').toBe(false);
    });
    test('Filtered object works when updating its children', () => {
        const obs$ = observable<Record<string, { text: string }>>({
            id1: { text: 'hi' },
            id2: { text: 'hi2' },
            id3: { text: 'hello3' },
            id4: { text: 'hi4' },
        });
        const filtered$ = observable(() => {
            return filterRecord(obs$, (value$) => value$.text.peek().startsWith('hi'));
        });
        filtered$.get();

        Object.values(filtered$).forEach((item$: Observable<{ text: string }>) => {
            item$.text.set((t) => t + '!');
        });

        expect(filtered$.get()).toEqual({
            id1: { text: 'hi!' },
            id2: { text: 'hi2!' },
            id4: { text: 'hi4!' },
        });

        expect(obs$.get()).toEqual({
            id1: { text: 'hi!' },
            id2: { text: 'hi2!' },
            id3: { text: 'hello3' },
            id4: { text: 'hi4!' },
        });
    });
    test('Filtered array works when updating its children', () => {
        const obs$ = observable<Record<string, { text: string }>>({
            id1: { text: 'hi' },
            id2: { text: 'hi2' },
            id3: { text: 'hello3' },
            id4: { text: 'hi4' },
        });
        const filtered$ = observable(() => {
            return Object.values(obs$).filter((value$) => value$.text.peek().startsWith('hi'));
        });
        filtered$.get();

        filtered$.forEach((item$: Observable<{ text: string }>) => {
            item$.text.set((t) => t + '!');
        });

        expect(filtered$.get()).toEqual([{ text: 'hi!' }, { text: 'hi2!' }, { text: 'hi4!' }]);

        expect(obs$.get()).toEqual({
            id1: { text: 'hi!' },
            id2: { text: 'hi2!' },
            id3: { text: 'hello3' },
            id4: { text: 'hi4!' },
        });
    });
    test('No recursive activation for functions', () => {
        let didCall = false;
        const obs = observable({
            test: 10,
            test2: 20,
            child: () => {
                didCall = true;
                return obs.test.get() + obs.test2.get();
            },
        });
        const child = obs.peek()['child'];
        expect(obs.get()).toEqual({ test: 10, test2: 20, child });
        expect(didCall).toEqual(false);
    });
    test('Recursive activation for linked function', () => {
        let didCall = false;
        const obs = observable({
            test: 10,
            test2: 20,
            child: linked((): number => {
                didCall = true;
                return obs.test.get() + obs.test2.get();
            }),
        });
        expect(obs.get()).toEqual({ test: 10, test2: 20, child: 30 });
        expect(didCall).toEqual(true);
    });
    test('Recursive activation for linked', () => {
        let didCall = false;
        const obs = observable({
            test: 10,
            test2: 20,
            child: linked({
                get: (): number => {
                    didCall = true;
                    return obs.test.get() + obs.test2.get();
                },
            }),
        });
        expect(obs.get()).toEqual({ test: 10, test2: 20, child: 30 });
        expect(didCall).toEqual(true);
    });
    test('Recursive activation for linked activate auto', () => {
        let didCall = false;
        const obs = observable({
            test: 10,
            test2: 20,
            child: linked({
                get: (): number => {
                    didCall = true;
                    return obs.test.get() + obs.test2.get();
                },
                activate: 'auto',
            }),
        });
        expect(obs.get()).toEqual({ test: 10, test2: 20, child: 30 });
        expect(didCall).toEqual(true);
    });
    test('Recursive activation for deep descendant in linked activate auto', () => {
        let didCall = false;
        const obs = observable({
            test: 10,
            test2: 20,
            child: {
                child2: {
                    child3: linked({
                        get: (): number => {
                            didCall = true;
                            return obs.test.get() + obs.test2.get();
                        },
                        activate: 'auto',
                    }),
                },
            },
        });
        expect(obs.get()).toEqual({ test: 10, test2: 20, child: { child2: { child3: 30 } } });
        expect(didCall).toEqual(true);
    });
    test('No recursive activation for linked activate lazy', () => {
        let didCall = false;
        const obs = observable({
            test: 10,
            test2: 20,
            child: linked({
                get: (): number => {
                    didCall = true;
                    return obs.test.get() + obs.test2.get();
                },
                activate: 'lazy',
            }),
        });
        const child = obs.peek()['child'];
        expect(obs.get()).toEqual({ test: 10, test2: 20, child });
        expect(didCall).toEqual(false);
    });
    test('linked child of observable link activated recursively', () => {
        let didGet = false;
        const valuesById$ = observable<Record<string, number>>({
            a: 1,
            b: 2,
            c: 3,
        });

        const obs$ = observable({
            currentId: 'a',
            children: (id: string) => ({
                value$: linked({
                    get: () => {
                        didGet = true;
                        return valuesById$[id];
                    },
                }),
            }),
            currentChild: linked({
                get: (): Observable<{ value$: Observable<number> }> => obs$.children[obs$.currentId.get()],
                activate: 'lazy',
            }),
        });

        obs$.get();
        expect(didGet).toEqual(false);
        obs$.currentChild.get();
        expect(didGet).toEqual(true);
    });
    test('lazy linked child of observable link not activated recursively', () => {
        let didGet = false;
        const valuesById$ = observable<Record<string, number>>({
            a: 1,
            b: 2,
            c: 3,
        });

        const obs$ = observable({
            currentId: 'a',
            children: (id: string) => ({
                value$: linked({
                    get: () => {
                        didGet = true;
                        return valuesById$[id];
                    },
                    activate: 'lazy',
                }),
            }),
            currentChild: linked({
                get: (): Observable<{ value$: Observable<number> }> => obs$.children[obs$.currentId.get()],
                activate: 'lazy',
            }),
        });

        obs$.get();
        expect(didGet).toEqual(false);
        obs$.currentChild.get();
        expect(didGet).toEqual(false);
    });
    test('Activates linked through link and lookup table redirect', () => {
        const valuesById$ = observable<Record<string, number>>({
            a: 1,
            b: 2,
            c: 3,
        });

        const obs$ = observable({
            currentId: 'a',
            children: (id: string) => ({
                id,
                value: linked(() => valuesById$[id]),
            }),
            currentChild: linked(
                (): Observable<{ id: string; value: Observable<number> }> => obs$.children[obs$.currentId.get()],
            ),
        });

        expect(obs$.get()).toEqual({
            children: {
                a: {
                    id: 'a',
                    value: 1,
                },
            },
            currentChild: {
                id: 'a',
                value: 1,
            },
            currentId: 'a',
        });
    });
});
describe('Deactivation', () => {
    test('Computed does not recompute unless listened or called', () => {
        let numComputes = 0;
        const obs$ = observable({ test: 10 });
        const comp$ = observable(() => {
            numComputes++;
            return obs$.test.get();
        });
        expect(getNode(comp$).listeners?.size).toEqual(undefined);
        expect(numComputes).toEqual(0);
        expect(comp$.get()).toEqual(10);
        expect(getNode(comp$).listeners?.size).toEqual(undefined);
        expect(numComputes).toEqual(1);
        obs$.test.set(20);
        expect(numComputes).toEqual(1);
        expect(comp$.get()).toEqual(20);
        expect(numComputes).toEqual(2);
    });
    test('Computed recomputes with onChange', () => {
        let numComputes = 0;
        let numChanges = 0;
        let lastValue = 0;
        const obs$ = observable({ test: 10 });
        const obs2$ = observable(() => obs$.test.get());
        const comp$ = observable(() => {
            numComputes++;
            return obs2$.get();
        });
        comp$.onChange(
            ({ value }) => {
                numChanges++;
                lastValue = value;
            },
            { initial: true },
        );
        expect(getNode(comp$).listeners?.size).toEqual(1);
        expect(numComputes).toEqual(1);
        expect(numChanges).toEqual(1);
        expect(lastValue).toEqual(10);
        obs$.test.set(20);
        // TODO: Seems like this should be 2? Why is it 3?
        expect(numComputes).toEqual(3);
        expect(numChanges).toEqual(2);
        expect(lastValue).toEqual(20);
    });
    test('Computed stops recomputing when unlistened', () => {
        let numComputes = 0;
        const obs$ = observable({ test: 10 });
        const comp$ = observable(() => {
            numComputes++;
            return obs$.test.get();
        });
        expect(getNode(comp$).numListenersRecursive).toEqual(0);
        expect(getNode(comp$).listeners?.size).toEqual(undefined);

        const dispose = observe(() => {
            expect(comp$.get() === obs$.test.peek());
        });
        expect(getNode(comp$).listeners?.size).toEqual(1);
        expect(getNode(comp$).numListenersRecursive).toEqual(1);
        expect(numComputes).toEqual(1);
        expect(comp$.get()).toEqual(10);
        expect(getNode(comp$).listeners?.size).toEqual(1);
        expect(getNode(comp$).numListenersRecursive).toEqual(1);
        expect(numComputes).toEqual(1);
        obs$.test.set(20);
        expect(numComputes).toEqual(2);
        expect(comp$.get()).toEqual(20);
        expect(numComputes).toEqual(2);
        expect(getNode(comp$).listeners?.size).toEqual(1);
        dispose();
        expect(getNode(comp$).listeners?.size).toEqual(0);
        expect(getNode(comp$).numListenersRecursive).toEqual(0);
        obs$.test.set(30);
        expect(numComputes).toEqual(2);
        obs$.test.set(40);
        expect(numComputes).toEqual(2);
        expect(comp$.get()).toEqual(40);
        expect(numComputes).toEqual(3);
        expect(getNode(comp$).listeners?.size).toEqual(0);
        expect(getNode(comp$).numListenersRecursive).toEqual(0);
    });
    test('Computed subscribe does not refresh when not observed', async () => {
        let interval: NodeJS.Timer | Timer | undefined = undefined;
        let numComputes = 0;
        const comp$ = observable(
            synced({
                get: () => {
                    return numComputes++;
                },
                subscribe: ({ refresh }) => {
                    interval = setInterval(refresh, 1);
                },
            }),
        );
        expect(numComputes).toEqual(0);
        comp$.get();

        expect(numComputes).toEqual(1);
        await promiseTimeout(1);
        expect(numComputes).toEqual(1);
        await promiseTimeout(10);
        expect(numComputes).toEqual(1);

        clearInterval(interval);
    });
    test('Computed stops refreshing from subscribe when unlistened', async () => {
        const num$ = observable(0);
        let observerDispose: () => void = () => {};
        let numComputes = 0;
        let isFirst = false;
        const comp$ = observable(
            synced({
                get: () => numComputes++,
                subscribe: ({ refresh }) => {
                    isFirst = true;
                    observerDispose = observe(num$, () => !isFirst && refresh());
                    isFirst = false;
                },
            }),
        );
        expect(numComputes).toEqual(0);

        let dispose = observe(() => comp$.get());
        expect(numComputes).toEqual(1);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(2);
        dispose();
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(2);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(2);

        dispose = observe(() => comp$.get());
        expect(numComputes).toEqual(3);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(4);
        dispose();
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(4);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(4);

        observerDispose?.();
    });
    test('Unsubscribe called when unlistened', async () => {
        let subscribed = false;
        const num$ = observable(0);
        let observerDispose: () => void = () => {};
        let numComputes = 0;
        let isFirst = false;
        const comp$ = observable(
            synced({
                get: () => numComputes++,
                subscribe: ({ refresh }) => {
                    isFirst = true;
                    observerDispose = observe(num$, () => !isFirst && refresh());
                    isFirst = false;
                    subscribed = true;
                    return () => {
                        subscribed = false;
                        observerDispose();
                    };
                },
            }),
        );
        expect(numComputes).toEqual(0);
        comp$.get();
        // It subscribes the first time because it doesn't know if it's being tracked
        expect(subscribed).toEqual(true);

        let dispose = observe(() => comp$.get());
        expect(numComputes).toEqual(1);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(2);
        dispose();
        num$.set((v) => v + 1);
        // Unsubscribes after the next refresh after disposing observer
        expect(subscribed).toEqual(false);
        expect(numComputes).toEqual(2);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(2);

        dispose = observe(() => comp$.get());
        expect(subscribed).toEqual(true);
        expect(numComputes).toEqual(3);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(4);
        dispose();
        num$.set((v) => v + 1);
        // Unsubscribes after the next refresh after disposing observer
        expect(subscribed).toEqual(false);
        expect(numComputes).toEqual(4);
        num$.set((v) => v + 1);
        expect(numComputes).toEqual(4);
    });
    test('unobserve lookup', () => {
        const count$ = observable(0);

        let numComputes = 0;

        const obs$ = observable((id: string) => {
            numComputes++;
            const count = count$.get();
            return id + count;
        });

        const disposeA = observe(() => {
            obs$['a'].get();
        });

        const disposeB = observe(() => {
            obs$['b'].get();
        });

        expect(numComputes).toBe(2);

        count$.set(1);

        expect(numComputes).toBe(4);

        disposeA();

        count$.set(2);

        expect(numComputes).toBe(5); // fails

        disposeB();

        count$.set(3);

        expect(numComputes).toBe(5);
    });
});
