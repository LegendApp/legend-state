import {
    beginBatch,
    computed,
    endBatch,
    isObservable,
    Observable,
    observable,
    observe,
    proxy,
    when,
} from '@legendapp/state';
import { expectChangeHandler } from './testglobals';

let spiedConsole: jest.SpyInstance;

beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    spiedConsole = jest.spyOn(global.console, 'error').mockImplementation(() => {});
});
afterAll(() => {
    spiedConsole.mockRestore();
});

describe('Computed', () => {
    test('Basic computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test.get() + obs.test2.get());
        expect(comp.get()).toEqual(30);
    });
    test('Observing computed runs once', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test.get() + obs.test2.get());
        let num = 0;
        let observedValue;
        observe(() => {
            observedValue = comp.get();
            num++;
        });

        expect(num).toEqual(1);
        expect(observedValue).toEqual(30);
    });
    test('Multiple computed changes', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test.get() + obs.test2.get());
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
        const comp = computed(() => ({ value: obs.test.get() + obs.test2.get() }));

        expect(comp.get()).toEqual({ value: 30 });
        expect(comp.value.get()).toEqual(30);
        const handler = expectChangeHandler(comp.value);

        obs.test.set(5);

        expect(handler).toHaveBeenCalledWith(25, 30, [{ path: [], pathTypes: [], valueAtPath: 25, prevAtPath: 30 }]);
    });
    test('Computed is lazy', () => {
        const fn = jest.fn();
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => {
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
        const comp = computed(() => {
            fn();
            return { v: obs.test.get() + obs.test2.get() };
        });
        expect(fn).not.toHaveBeenCalled();
        comp.v.get();
        expect(fn).toHaveBeenCalled();
    });
    test('Computed with promise', async () => {
        const ready$ = observable(false);
        const obs$ = observable(new Promise<string>((resolve) => setTimeout(() => resolve('hi'), 0)));
        const comp$ = computed(() => {
            const value = obs$.get();
            if (value) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve('hi there');
                        setTimeout(() => {
                            ready$.set(true);
                        }, 0);
                    }, 0);
                });
            }
        });
        expect(comp$.get()).toEqual(undefined);
        await when(comp$);
        await when(ready$);
        expect(comp$.get()).toEqual('hi there');
    });
});
describe('Two way Computed', () => {
    test('Bound to two, get', () => {
        const obs = observable({ test: false, test2: false });
        const comp = computed(
            () => obs.test.get() && obs.test2.get(),
            (value) => {
                obs.test.set(value);
                obs.test2.set(value);
            },
        );
        expect(comp.get()).toEqual(false);
        obs.test.set(true);
        expect(comp.get()).toEqual(false);
        obs.test2.set(true);
        expect(comp.get()).toEqual(true);
    });
    test('Bound to two, set', () => {
        const obs = observable({ test: false, test2: false });
        const comp = computed(
            () => obs.test.get() && obs.test2.get(),
            (value) => {
                obs.test.set(value);
                obs.test2.set(value);
            },
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
    test('Bound to two, set child', () => {
        const obs = observable({ test: { a: 'hi' }, test2: false });
        const comp = computed(
            () => obs.test.get(),
            (value) => obs.test.set(value),
        );
        expect(comp.a.get()).toEqual('hi');
        comp.a.set('bye');
        expect(comp.a.get()).toEqual('bye');
    });
    test('Bound to array, set', () => {
        const obs = observable([false, false, false, false, false]);
        const comp = computed(
            () => obs.every((val) => val.get()),
            (value) => obs.forEach((child) => child.set(value)),
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs[0].get()).toEqual(true);
        expect(comp.get()).toEqual(true);
    });
    test('Bound to two, set, handler', () => {
        const obs = observable({ test: false, test2: false });
        const handler = expectChangeHandler(obs);
        const comp = computed(
            () => obs.test.get() && obs.test2.get(),
            (value) => {
                obs.test.set(value);
                obs.test2.set(value);
            },
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
    test('Computed has set before activation', () => {
        const obs = observable({ test: false, test2: false });
        const comp = computed(
            () => obs.test.get() && obs.test2.get(),
            (value) => {
                obs.test.set(value);
                obs.test2.set(value);
            },
        );

        comp.set(true);

        expect(obs.test.get()).toEqual(true);
    });
    test('Set child of computed', () => {
        const obs = observable({ test: false, test2: false });
        const comp = computed(
            () => ({
                computedValue: obs.test.get() && obs.test2.get(),
            }),
            ({ computedValue }) => {
                obs.test.set(computedValue);
                obs.test2.set(computedValue);
            },
        );
        expect(comp.get()).toEqual({ computedValue: false });
        comp.computedValue.set(true);
        expect(comp.get()).toEqual({ computedValue: true });
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
    test('Computed activates before set', () => {
        const obs = observable({ test: false, test2: false });
        const comp = computed(
            () => {
                return {
                    computedValue: obs.test.get(),
                    computedValue2: obs.test2.get(),
                };
            },
            ({ computedValue }) => {
                obs.test.set(computedValue);
            },
        );
        comp.computedValue.set(true);
        expect(comp.get()).toEqual({ computedValue: true, computedValue2: false });
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(false);
    });
    test('Computed activates when undefined', () => {
        const obs = observable<boolean[]>(undefined as unknown as boolean[]);
        const comp = computed(() => {
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

        const comp = computed(
            () => obs.get() + '',
            (value: string) => obs.set(+value),
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

        const comp = computed(() => obs.get() + 'A');

        // First get activates it
        expect(comp.get()).toEqual('0A');

        beginBatch();
        obs.set(1);
        expect(comp.get()).toEqual('1A');
        endBatch();
    });
    test('Computed values are set correctly while in batch nested', () => {
        const obs = observable(0);

        const comp = computed(() => obs.get() + 'A');
        const comp2 = computed(() => comp.get() + 'B');
        const comp3 = computed(() => comp2.get() + 'C');

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
        const comp = computed(() => {
            return Object.keys(obs.get()).sort((a, b) => (+a - +b) * sort.get());
        });
        const handler = expectChangeHandler(comp);

        expect(comp.get()).toEqual(['1', '2']);

        sort.set(-1);

        expect(handler).toHaveBeenCalledTimes(1);

        expect(comp.get()).toEqual(['2', '1']);
    });
});
describe('Computed inside observable', () => {
    test('Computed in observable', () => {
        const obs = observable({
            text: 'hi',
            test: computed((): string => {
                return obs.text.get() + '!';
            }),
        });
        expect(obs.test.get() === 'hi!');
    });
    test('Computed assigned later', () => {
        const obs = observable({ text: 'hi' } as { text: any; test: any });
        obs.assign({
            test: computed(() => obs.text.get() + '!'),
        });
        expect(obs.test.get() === 'hi!');
    });
    test('Computed selected gets correct value', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            selected: undefined as unknown as string,
            selectedItem: computed((): { text: string } => obs.items[obs.selected.get()].get()),
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
            selectedItem: computed((): Observable<Item> => {
                return obs.items[obs.selected.get()];
            }),
        });

        // Check that sets works before get is called
        obs.selectedItem.text.set('hi');

        const handlerObs = expectChangeHandler(obs.items);
        const handlerSelected = expectChangeHandler(obs.selected);
        const handlerItem = expectChangeHandler(obs.selectedItem);

        obs.selectedItem.text.set('hi!');
        expect(obs.selectedItem.get()).toEqual({
            text: 'hi!',
        });
        expect(obs.items.test1.get()).toEqual({
            text: 'hi!',
        });
        expect(handlerObs).toHaveBeenCalledWith(
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
        expect(handlerItem).toHaveBeenCalledTimes(3);
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
        expect(handlerItem).toHaveBeenCalledTimes(4);
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
        const comp = computed(() => obs);

        expect(obs.get()).toEqual(1);
        expect(comp.get()).toEqual(1);
        expect(comp.get()).toEqual(1);
    });
    test('Computed in observable sets raw data', () => {
        const obs = observable({
            text: 'hi',
            test: computed((): string => {
                return obs.text.get() + '!';
            }),
        });

        expect(obs.test.get()).toEqual('hi!');
        expect(obs.get().test).toEqual('hi!');
        expect(isObservable(obs.get().test)).toBe(false);
    });
    test('Computed in observable notifies to root', () => {
        const obs = observable({
            text: 'hi',
            test: computed((): string => {
                return obs.text.get() + '!';
            }),
        });
        obs.test.get();
        const handler = expectChangeHandler(obs);
        obs.text.set('hello');
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
    test('Accessing through proxy goes to computed and not parent object', () => {
        const test = computed((): { child: string } => {
            return { child: obs.text.get() + '!' };
        });
        const obs = observable({
            text: 'hi',
            test,
        });
        const handler = expectChangeHandler(test.child);
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
                {
                    path: ['test'],
                    pathTypes: ['object'],
                    prevAtPath: { child: 'hi!' },
                    valueAtPath: { child: 'hello!' },
                },
            ],
        );
    });
    test('observe sub function runs twice with child computed', () => {
        const sub$ = observable({
            num: 0,
            source: true,
        });

        const obs$ = observable({
            sub: () => {
                return sub$.get();
            },
        });

        let num = 0;
        let expectSub = 0;
        observe(() => {
            const value = obs$.sub.get();
            expect(value).toEqual({ num: expectSub, source: true });
            num++;
        });

        expect(num).toEqual(1);

        expectSub = 1;
        sub$.num.set(1);

        expect(num).toEqual(2);
    });
    test('observe sub computed runs once with child computed', () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: computed(() => {
                return sub$.get();
            }),
        });

        let num = 0;
        let expectSub = 0;
        observe(() => {
            expect(obs$.sub.get()).toEqual({ num: expectSub });
            num++;
        });

        expect(num).toEqual(1);

        expectSub = 1;
        sub$.num.set(1);

        // TODONOTIFY: It would be great if this were 2
        expect(num).toEqual(3);
    });
    test('Setting through two-way sets values on parent', () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: computed(
                () => sub$.get(),
                (x) => sub$.set(x),
            ),
        });

        let observedValue;
        observe(() => {
            observedValue = obs$.sub.get();
        });

        expect(observedValue).toEqual({ num: 0 });

        obs$.sub.set({ num: 4 });

        expect(observedValue).toEqual({ num: 4 });
        expect(obs$.get()).toEqual({ sub: { num: 4 } });

        obs$.sub.set({ num: 8 });

        expect(observedValue).toEqual({ num: 8 });
        expect(obs$.get()).toEqual({ sub: { num: 8 } });
    });
    test('linked observable sets value on parent', () => {
        const sub$ = observable({
            num: 0,
        });

        const obs$ = observable({
            sub: computed(() => sub$),
        });

        expect(obs$.sub.get()).toEqual({ num: 0 });

        obs$.sub.num.set(4);

        let observedValue;
        observe(() => {
            observedValue = obs$.get();
        });

        expect(observedValue).toEqual({ sub: { num: 4 } });
        expect(obs$.get()).toEqual({ sub: { num: 4 } });
    });
});
describe('proxy', () => {
    test('proxy plain', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: proxy((key: string): string => {
                return obs.items[key].text.get();
            }),
        });
        expect(obs.itemText['test1'].get()).toEqual('hi');

        const handlerItem = expectChangeHandler(obs.items['test1']);
        const handlerItemText = expectChangeHandler(obs.itemText['test1']);

        obs.items['test1'].text.set('hi!');
        expect(obs.items['test1'].text.get()).toEqual('hi!');
        expect(obs.itemText['test1'].get()).toEqual('hi!');

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
    test('proxy two-way', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: proxy(
                (key): string => {
                    return obs.items[key].text.get();
                },
                (key, value) => {
                    obs.items[key].text.set(value);
                },
            ),
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
    test('proxy link', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: proxy((key: string): Observable<string> => {
                return obs.items[key].text;
            }),
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
    test('proxy link with a get()', () => {
        const obs = observable({
            selector: 'text',
            items: {
                test1: { text: 'hi', othertext: 'bye' },
                test2: { text: 'hello', othertext: 'goodbye' },
            } as Record<string, Record<string, string>>,
            itemText: proxy((key: string): Observable<string> => {
                return obs.items[key][obs.selector.get()];
            }),
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
    test('raw value of proxy has all values', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: proxy((key: string): Observable<string> => {
                return obs.items[key].text;
            }),
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
    test('listener on proxy works', () => {
        const obs = observable({
            items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            itemText: proxy((key: string): Observable<string> => {
                return obs.items[key].text;
            }),
        });
        // Get the value just to make this test easier so it doesn't have function as the previous value
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
});
