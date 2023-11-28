import {
    Change,
    Observable,
    ObservableReadable,
    TrackingType,
    activated,
    batch,
    beginBatch,
    endBatch,
    internal,
    isObservable,
    observable,
    observe,
    syncState,
    when,
    whenReady,
} from '../index';
const { globalState } = internal;

export const run = (isPersist: boolean) => {
    describe('Make sure activateNode overridden with persist', () => {
        test('activateNode overriden', () => {
            expect(globalState.activateNode.name).toEqual(isPersist ? 'activateNodePersist' : 'activateNodeBase');
        });
    });
    function promiseTimeout(time?: number) {
        return new Promise((resolve) => setTimeout(resolve, time || 0));
    }

    let spiedConsole: jest.SpyInstance;

    beforeAll(() => {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
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
        test('Observing computed runs twice, once to activate', () => {
            const obs = observable({ test: 10, test2: 20 });
            const comp = observable(() => obs.test.get() + obs.test2.get());
            let num = 0;
            let observedValue;
            observe(() => {
                observedValue = comp.get();
                num++;
            });

            expect(num).toEqual(2);
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
            expect(handler).toHaveBeenCalledWith(25, 30, [
                { path: [], pathTypes: [], valueAtPath: 25, prevAtPath: 30 },
            ]);
            expect(comp.get()).toEqual(25);
            obs.test.set(1);
            expect(handler).toHaveBeenCalledWith(21, 25, [
                { path: [], pathTypes: [], valueAtPath: 21, prevAtPath: 25 },
            ]);
            expect(comp.get()).toEqual(21);
        });
        test('Cannot directly set a computed', () => {
            const obs = observable({ test: 10, test2: 20 });
            const comp = observable(() => obs.test.get() + obs.test2.get());
            // @ts-expect-error Expect this to throw an error
            comp.set(40);
            // @ts-expect-error Expect this to throw an error
            comp.assign({ text: 'hi' });
            // @ts-expect-error Expect this to throw an error
            comp.delete();
        });
        test('Computed object is observable', () => {
            const obs = observable({ test: 10, test2: 20 });
            const comp = observable(() => ({ value: obs.test.get() + obs.test2.get() }));

            expect(comp.get()).toEqual({ value: 30 });
            expect(comp.value.get()).toEqual(30);
            const handler = expectChangeHandler(comp.value);

            obs.test.set(5);

            expect(handler).toHaveBeenCalledWith(25, 30, [
                { path: [], pathTypes: [], valueAtPath: 25, prevAtPath: 30 },
            ]);
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
            const obs = observable(new Promise<string>((resolve) => setTimeout(() => resolve('hi'), 0)));
            const comp = observable(() => {
                const value = obs.get();
                if (value) {
                    return new Promise((resolve) => {
                        setTimeout(() => resolve('hi there'), 0);
                    });
                }
            });
            expect(comp.get()).toEqual(undefined);
            await promiseTimeout(10);
            expect(comp.get()).toEqual('hi there');
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
                activated({
                    onSet: ({ value }) => {
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
                activated({
                    onSet: ({ value }) => {
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
                activated({
                    onSet: ({ value }) => {
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
                activated({
                    onSet: ({ value }) => {
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
        test('Computed has set before activation', () => {
            const obs = observable({ test: false, test2: false });
            const comp = observable(
                activated({
                    onSet: ({ value }) => {
                        obs.test.set(value);
                        obs.test2.set(value);
                    },
                    get: () => obs.test.get() && obs.test2.get(),
                }),
            );
            comp.set(true);

            expect(obs.test.get()).toEqual(true);
        });
        test('Computed set works before loaded', async () => {
            let setValue: number | undefined = undefined;
            let getValue: number | undefined = undefined;
            const comp = observable(
                activated({
                    onSet: ({ value }) => {
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
                activated({
                    onSet: ({ value }) => {
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
                activated({
                    onSet: ({ value: { computedValue } }) => {
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
                activated({
                    onSet: ({ value: { computedValue } }) => {
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
                activated({
                    onSet: ({ value }) => {
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
            expect(comp.get()).toEqual(0);

            batch(() => {
                obs1.set(1);
                obs2.set(1);
            });
            expect(num).toEqual(2);
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
        test('Computed assigned later', () => {
            const obs = observable({ text: 'hi' } as { text: any; test: any });
            obs.assign({
                test: () => obs.text.get() + '!',
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
            const obs = observable({ name: 'hi' });
            const obs2 = observable(() => num$.get() > 1 && obs);
            const comp = observable(() => (num$.get() > 0 ? obs2 : undefined));

            expect(comp.name.get()).toEqual(undefined);

            num$.set(1);

            expect(comp.name.get()).toEqual(false);

            num$.set(2);

            expect(comp.name.get()).toEqual('hi');
        });
        test('Computed link to activated updates when changing', async () => {
            const num$ = observable(0);
            const obs = observable(
                activated({
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

            await promiseTimeout(10);

            expect(comp.get()).toEqual('hi');
        });
        test('Computed link to link to activated updates when changing', async () => {
            const num$ = observable(0);
            const obs = observable(
                activated({
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
                test: activated({
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
                return { test1: num$.get() > 1 && obs.test };
            });
            const comp = observable<{ test1: string | boolean }>(() => {
                return num$.get() > 0 ? obs2 : (undefined as any);
            });

            expect(comp.test1.get()).toEqual(undefined);

            num$.set(1);

            expect(comp.test1.get()).toEqual(false);

            num$.set(2);

            await promiseTimeout(10);

            console.log(comp.get());

            expect(comp.test1.get()).toEqual('hi');
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
            const comp = observable({ sum: activated({ get: () => obs.test.get() + obs.test2.get() }) });
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
        test('Accessing through lookup goes to computed and not parent object', () => {
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

            expect(num).toEqual(2);
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
                sub: activated({
                    onSet: ({ value }) => {
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
        test('lookup plain', () => {
            const obs = observable({
                items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
            });
            const itemText = observable(
                activated({
                    lookup: (key) => obs.items[key].text.get(),
                }),
            );
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
            const itemText = observable(
                activated({
                    lookup: (key) =>
                        activated({
                            onSet: ({ value }) => {
                                obs.items[key].text.set(value);
                            },
                            get: () => {
                                return obs.items[key].text.get();
                            },
                        }),
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
                itemText: activated({
                    lookup: (key): Observable<string> => {
                        return obs.items[key].text;
                    },
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
        test('lookup link with a get()', () => {
            const obs = observable({
                selector: 'text',
                items: {
                    test1: { text: 'hi', othertext: 'bye' },
                    test2: { text: 'hello', othertext: 'goodbye' },
                } as Record<string, Record<string, string>>,
                itemText: activated({
                    lookup: (key): Observable<string> => obs.items[key][obs.selector.get()],
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
        test('lookup into child', () => {
            const obs = observable({
                selector: 'text',
                items: {
                    test1: { text: 'hi', othertext: 'bye' },
                    test2: { text: 'hello', othertext: 'goodbye' },
                } as Record<string, Record<string, string>>,
                itemLink: activated({
                    lookup: (key): Observable<Record<string, string>> => obs.items[key],
                }),
            });
            expect(obs.itemLink['test1'].text.get()).toEqual('hi');
        });
        test('lookup into child with undefined key', () => {
            const obs = observable({
                items: activated({
                    get: () =>
                        ({
                            test1: { text: 'hi', othertext: 'bye' },
                            test2: { text: 'hello', othertext: 'goodbye' },
                        }) as Record<string, Record<string, string>>,
                }),
                itemLink: activated({
                    lookup: (key): Observable<string> => {
                        return obs.items[key].text;
                    },
                }),
            });
            expect(obs.itemLink[undefined as any].get()).toEqual(undefined);
        });
        test('lookup into lookup', () => {
            const obs = observable({
                team: activated({
                    lookup: (teamID) => ({
                        profile: activated({
                            get: () => {
                                return { username: teamID + ' name' };
                            },
                        }),
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
                team: activated({
                    lookup: (teamID) => ({
                        profile: activated({
                            get: () => {
                                return { username: teamID + ' name' };
                            },
                        }),
                    }),
                }),
            });
            expect(obs.link.profile.username.get()).toEqual('asdf name');
        });
        test('raw value of lookup has all values', () => {
            const obs = observable({
                items: { test1: { text: 'hi' }, test2: { text: 'hello' } } as Record<string, { text: string }>,
                itemText: activated({
                    lookup: (key): Observable<string> => obs.items[key].text,
                }),
            });
            expect(obs.get()).toEqual({
                items: { test1: { text: 'hi' }, test2: { text: 'hello' } },
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
                itemText: activated({
                    lookup: (key): Observable<string> => {
                        return obs.items[key].text;
                    },
                }),
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
                        // TODO This should be "hi"? - not sure how to fix that though
                        test1: 'hi!',
                    },
                },
                [
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
    describe('subscribing to computeds', () => {
        test('subscription with update', async () => {
            const obs = observable(
                activated({
                    subscribe: ({ update }) => {
                        setTimeout(() => {
                            update({ value: 'hi there again' });
                        }, 5);
                    },
                    get: () => {
                        return new Promise<string>((resolve) => {
                            setTimeout(() => resolve('hi there'), 0);
                        });
                    },
                }),
            );
            expect(obs.get()).toEqual(undefined);
            await promiseTimeout(0);
            expect(obs.get()).toEqual('hi there');
            await promiseTimeout(10);
            expect(obs.get()).toEqual('hi there again');
        });
        test('subscription with refresh', async () => {
            let num = 0;
            const waiter = observable(0);
            const obs = observable(
                activated({
                    subscribe: ({ refresh }) => {
                        when(
                            () => waiter.get() === 1,
                            () => {
                                setTimeout(() => {
                                    refresh();
                                }, 0);
                            },
                        );
                    },
                    get: () =>
                        new Promise<string>((resolve) => {
                            setTimeout(() => {
                                resolve('hi there ' + num++);
                                waiter.set((v) => v + 1);
                            }, 0);
                        }),
                }),
            );
            expect(obs.get()).toEqual(undefined);
            await promiseTimeout(0);
            expect(obs.get()).toEqual('hi there 0');
            await when(() => waiter.get() === 2);
            expect(obs.get()).toEqual('hi there 1');
        });
        test('subscribe update runs after get', async () => {
            let didGet = false;
            const obs = observable(
                activated({
                    subscribe: ({ update }) => {
                        setTimeout(() => {
                            update({ value: 'from subscribe' });
                        }, 0);
                    },
                    get: () => {
                        return new Promise<string>((resolve) => {
                            setTimeout(() => {
                                didGet = true;
                                resolve('hi there');
                            }, 5);
                        });
                    },
                }),
            );
            expect(obs.get()).toEqual(undefined);
            expect(didGet).toEqual(false);
            await promiseTimeout(0);
            expect(didGet).toEqual(false);
            expect(obs.get()).toEqual(undefined);
            await promiseTimeout(0);
            expect(didGet).toEqual(false);
            expect(obs.get()).toEqual(undefined);
            await whenReady(obs);
            expect(didGet).toEqual(true);
            expect(obs.get()).toEqual('from subscribe');
        });
    });
    describe('loading', () => {
        test('isLoaded', async () => {
            const obs = observable(() => {
                return new Promise<string>((resolve) => {
                    setTimeout(() => resolve('hi there'), 0);
                });
            });
            const state = syncState(obs);
            expect(state.isLoaded.get()).toEqual(false);
            await promiseTimeout(0);
            expect(state.isLoaded.get()).toEqual(true);
            expect(obs.get()).toEqual('hi there');
        });
        test('isLoaded with activated', async () => {
            const obs = observable(
                activated({
                    get: () => {
                        return new Promise<string>((resolve) => {
                            setTimeout(() => resolve('hi there'), 0);
                        });
                    },
                    initial: 'initial',
                }),
            );
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
                activated({
                    get: () => {
                        return new Promise<string>((resolve) => {
                            setTimeout(() => resolve('hi there'), 0);
                        });
                    },
                    onSet: () => {
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
                activated({
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
        test('Basic computed set after with activated child', () => {
            const obs = observable({ test: 10, test2: 20 });
            const comp = observable<{ child: number }>();
            comp.set({ child: activated({ get: () => obs.test.get() + obs.test2.get() }) });
            expect(comp.child.get()).toEqual(30);
        });
    });
};
