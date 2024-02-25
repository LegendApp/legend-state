import {
    Change,
    Observable,
    ObservableReadable,
    TrackingType,
    activated,
    batch,
    beginBatch,
    endBatch,
    isObservable,
    observable,
    observe,
    syncState,
    when,
} from '../index';

export const run = () => {
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
                b: activated({
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
                activated({
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
        test('lookup basic', async () => {
            const obs = observable((key: string) => 'proxied_' + key);
            expect(obs.test.get()).toEqual('proxied_test');
        });
        test('lookup basic as child', async () => {
            const obs = observable<{ child: Record<string, string> }>({
                child: (key: string) => 'proxied_' + key,
            });
            expect(obs.child.test.get()).toEqual('proxied_test');
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
                activated({
                    onSet: ({ value }) => {
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
                items: activated({
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
                    profile: activated({
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
                    profile: activated({
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
    describe('Set a direct link', () => {
        const obs = observable({
            test1: 10,
            test2: 5,
        });
        expect(obs.test2.get()).toEqual(5);
        obs.test2.set(obs.test1);

        expect(obs.test1.get()).toEqual(10);
        expect(obs.test2.get()).toEqual(10);
    });
    describe('Observable link to observable', () => {
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
    describe('Observable link to observable object', () => {
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
            expect(handler).toHaveBeenCalledWith(30, 10, [
                { path: [], pathTypes: [], valueAtPath: 30, prevAtPath: 10 },
            ]);
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
};
