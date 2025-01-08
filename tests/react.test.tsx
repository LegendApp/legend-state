import { act, render, renderHook } from '@testing-library/react';
import React, { StrictMode, Suspense, createElement, useReducer, useState } from 'react';
import { getObservableIndex } from '../src/helpers';
import { observable } from '../src/observable';
import { Observable } from '../src/observableTypes';
import { For } from '../src/react/For';
import { Reactive } from '../src/react/Reactive';
import { Show } from '../src/react/Show';
import { Switch } from '../src/react/Switch';
import { observer } from '../src/react/reactive-observer';
import { useObservable } from '../src/react/useObservable';
import { useObservableReducer } from '../src/react/useObservableReducer';
import { useObservableState } from '../src/react/useObservableState';
import { useObserve } from '../src/react/useObserve';
import { useObserveEffect } from '../src/react/useObserveEffect';
import { use$, useSelector } from '../src/react/useSelector';
import { getNode } from '../src/globals';
import { Memo } from '../src/react/Memo';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { useComputed } from '../src/react/useComputed';
import { when } from '../src/when';
import { promiseTimeout, supressActWarning } from './testglobals';
import { synced } from '../src/sync/synced';
import { useTraceListeners } from '../src/trace/useTraceListeners';
import { useTraceUpdates } from '../src/trace/useTraceUpdates';

type TestObject = { id: string; label: string };

GlobalRegistrator.register();

describe('useSelector', () => {
    test('useSelector basics', () => {
        const obs = observable('hi');
        let num = 0;
        const { result } = renderHook(() => {
            return useSelector(() => {
                num++;
                return obs.get() + ' there';
            });
        });

        expect(num).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(3);
        expect(result.current).toEqual('hello there');
        act(() => {
            obs.set('z');
        });
        expect(num).toEqual(5);
        expect(result.current).toEqual('z there');
    });
    test('useSelector with observable', () => {
        const obs = observable('hi');
        const { result } = renderHook(() => {
            return useSelector(() => obs.get());
        });

        act(() => {
            obs.set('hello');
        });
        expect(result.current).toEqual('hello');
        act(() => {
            obs.set('z');
        });
        expect(result.current).toEqual('z');
    });
    test('useSelector undefined', () => {
        const { result } = renderHook(() => {
            return useSelector(undefined);
        });

        expect(result.current).toEqual(undefined);
    });
    test('useSelector setting twice', () => {
        const obs = observable('hi');
        let num = 0;
        const { result } = renderHook(() => {
            return useSelector(() => {
                num++;
                return obs.get() + ' there';
            });
        });

        expect(num).toEqual(1);
        expect(result.current).toEqual('hi there');
        act(() => {
            obs.set('hello');
            obs.set('hello2');
        });
        expect(num).toEqual(4); // Once for each set plus the render
        expect(result.current).toEqual('hello2 there');
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(6); // Once for set plus render
        expect(result.current).toEqual('hello there');
    });
    test('useSelector two observables', () => {
        const obs = observable('hi');
        const obs2 = observable('hello');
        let num = 0;
        const { result } = renderHook(() => {
            return useSelector(() => {
                num++;
                return obs.get() + ' ' + obs2.get() + ' there';
            });
        });

        expect(num).toEqual(1);
        expect(result.current).toEqual('hi hello there');
        act(() => {
            obs.set('aa');
            obs.set('a');
            obs2.set('bb');
            obs2.set('b');
        });
        expect(num).toEqual(6);
        expect(result.current).toEqual('a b there');
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(8);
        expect(result.current).toEqual('hello b there');
        act(() => {
            obs2.set('z');
        });
        expect(num).toEqual(10);
        expect(result.current).toEqual('hello z there');
    });
    test('useSelector cleaned up', () => {
        const obs = observable('hi');
        let num = 0;
        const { result, unmount } = renderHook(() => {
            return useSelector(() => {
                num++;
                return obs.get() + ' there';
            });
        });

        expect(num).toEqual(1);
        expect(result.current).toEqual('hi there');

        unmount();

        act(() => {
            obs.set('a');
        });
        // Set after unmounted triggers the observe but since it does not
        // re-render it does not run again
        expect(num).toEqual(1);
        expect(result.current).toEqual('hi there');

        act(() => {
            obs.set('b');
        });

        expect(num).toEqual(1);
    });
    test('useSelector with forceRender', () => {
        const obs = observable('hi');
        let num = 0;
        let numSelects = 0;
        let fr: () => void;
        function Test() {
            fr = useReducer((s) => s + 1, 0)[1];
            const val = useSelector(() => {
                numSelects++;
                return obs.get() + ' there';
            });
            num++;

            return createElement('div', undefined, val);
        }
        render(createElement(Test));

        act(() => {
            fr();
            fr();
            obs.set('hello1');
            obs.set('hello2');
            obs.set('hello');
            fr();
            fr();
        });

        expect(num).toEqual(3);
        expect(numSelects).toEqual(6);

        act(() => {
            fr();
            fr();
            obs.set('hello2');
            obs.set('hello3');
            obs.set('hello4');
            fr();
            fr();
        });

        expect(num).toEqual(5);
        expect(numSelects).toEqual(11);
    });
    test('useSelector runs once in non-strict mode', () => {
        const obs = observable('hi');

        let num = 0;
        function Test() {
            const value = useSelector(() => {
                num++;
                return obs.get() + ' there';
            });
            return createElement('div', undefined, value);
        }
        render(createElement(Test));

        expect(num).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(3);
    });
    test('useSelector runs twice in strict mode', () => {
        const obs = observable('hi');

        let num = 0;
        function Test() {
            const value = useSelector(() => {
                num++;
                return obs.get() + ' there';
            });
            return createElement('div', undefined, value);
        }
        function App() {
            return createElement(StrictMode, undefined, createElement(Test));
        }
        render(createElement(App));

        expect(num).toEqual(2);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(6);
    });
    test('Renders once with one selector listening to multiple', () => {
        const obs = observable('hi');
        const obs2 = observable('hi');
        const obs3 = observable('hi');

        let num = 0;
        function Test() {
            const value = useSelector(() => {
                num++;
                return obs.get() + obs.get() + obs2.get() + obs3.get() + ' there';
            });
            return createElement('div', undefined, value);
        }
        render(createElement(Test));

        expect(num).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(3);
    });
    test('Renders once for each selector', () => {
        const obs = observable('hi');
        const obs2 = observable('hi');
        const obs3 = observable('hi');

        let num = 0;
        function Test() {
            const value = useSelector(() => {
                num++;
                return obs.get() + ' there';
            });
            const value2 = useSelector(() => {
                num++;
                return obs2.get() + ' there';
            });
            const value3 = useSelector(() => {
                num++;
                return obs3.get() + ' there';
            });
            return createElement('div', undefined, value + value2 + value3);
        }
        render(createElement(Test));

        expect(num).toEqual(3);
        act(() => {
            obs.set('hello');
        });
        // Goes up by two because it runs, decides to re-render, and runs again
        expect(num).toEqual(7);
    });
    test('useSelector renders once when set to the same thing', () => {
        const obs = observable('hi');
        let num = 0;
        renderHook(() => {
            return useSelector(() => {
                num++;
                return obs.get() + ' there';
            });
        });

        expect(num).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(3);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(3); // Doesn't re-run the selector so it's not different
        act(() => {
            obs.set('hi');
        });
        expect(num).toEqual(5);
    });
    test('useSelector renders once when it returns the same thing', () => {
        const obs = observable('hi');
        let num = 0;
        let num2 = 0;
        let lastValue = false;

        const Test = function Test() {
            num2++;
            lastValue = useSelector(() => {
                num++;
                return obs.get() === 'hi';
            });

            return createElement('div', undefined);
        };
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(lastValue).toEqual(true);
        expect(num).toEqual(1);
        expect(num2).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(3);
        expect(num2).toEqual(2);
        act(() => {
            obs.set('hello2');
        });
        expect(num).toEqual(4);
        expect(num2).toEqual(2);
    });
    test('useSelector with changing nodes', () => {
        const obs1$ = observable(false);
        const obs2$ = observable(false);
        let lastValue = false;
        const Test = function Test() {
            lastValue = useSelector(() => {
                return !obs1$.get() || !obs2$.get();
            });

            return createElement('div', undefined);
        };
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(lastValue).toEqual(true);
        act(() => {
            obs1$.set(true);
        });
        expect(lastValue).toEqual(true);
        act(() => {
            obs2$.set(true);
        });
        expect(lastValue).toEqual(false);
    });
    test('useSelector listener count strict', () => {
        const obs = observable('hi');
        let num = 0;
        const numListeners = () => getNode(obs).listeners?.size;

        function Test() {
            const value = useSelector(() => {
                return obs.get() + ' there';
            });
            num++;
            return createElement('div', undefined, value);
        }
        function App() {
            return createElement(StrictMode, undefined, createElement(Test));
        }
        render(createElement(App));

        expect(numListeners()).toEqual(2);
        expect(num).toEqual(2);
        act(() => {
            obs.set('hello');
        });
        expect(numListeners()).toEqual(2);
        expect(num).toEqual(4);
        act(() => {
            obs.set('z');
        });
        expect(numListeners()).toEqual(2);
        expect(num).toEqual(6);
        act(() => {
            obs.set('q');
        });
        expect(numListeners()).toEqual(2);
        expect(num).toEqual(8);
    });
    test('useSelector listener count', () => {
        const obs = observable('hi');
        let num = 0;
        const numListeners = () => getNode(obs).listeners?.size;

        function Test() {
            const value = useSelector(() => {
                return obs.get() + ' there';
            });
            num++;
            return createElement('div', undefined, value);
        }
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(numListeners()).toEqual(1);
        expect(num).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(numListeners()).toEqual(1);
        expect(num).toEqual(2);
        act(() => {
            obs.set('z');
        });
        expect(numListeners()).toEqual(1);
        expect(num).toEqual(3);
        act(() => {
            obs.set('q');
        });
        expect(numListeners()).toEqual(1);
        expect(num).toEqual(4);
    });
    test('useSelector for pure proxy use', () => {
        const obs = observable('hi');
        let num = 0;
        const numListeners = () => getNode(obs).listeners?.size;

        function Test() {
            const value = useSelector(obs);
            num++;
            return createElement('div', undefined, value);
        }
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(numListeners()).toEqual(1);
        expect(num).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(numListeners()).toEqual(1);
        expect(num).toEqual(2);
        act(() => {
            obs.set('z');
        });
        expect(numListeners()).toEqual(1);
        expect(num).toEqual(3);
        act(() => {
            obs.set('q');
        });
        expect(numListeners()).toEqual(1);
        expect(num).toEqual(4);
    });
    test('suspense without observer', () => {
        supressActWarning(async () => {
            const obs$ = observable(
                new Promise<string>((resolve) =>
                    setTimeout(() => {
                        resolve('hi');
                    }, 10),
                ),
            );
            const isDone$ = observable(undefined as string | undefined);
            const Test = function Test() {
                const value = useSelector(obs$, { suspense: true });
                isDone$.set(value);

                return createElement('div', undefined, value);
            };
            function App() {
                return createElement(
                    Suspense,
                    { fallback: createElement('div', undefined, 'fallback') },
                    createElement(Test),
                );
            }
            const { container } = render(createElement(App));
            let items = container.querySelectorAll('div');
            expect(items[0].textContent).toEqual('fallback');

            expect(await when(isDone$)).toEqual('hi');
            items = container.querySelectorAll('div');
            expect(items[0].textContent).toEqual('hi');
        });
    });
    test('suspense with observer', () => {
        supressActWarning(async () => {
            const obs$ = observable(
                new Promise<string>((resolve) =>
                    setTimeout(() => {
                        resolve('hi');
                    }, 10),
                ),
            );
            const isDone$ = observable(undefined as string | undefined);
            const Test = observer(function Test() {
                const value = useSelector(obs$, { suspense: true });
                isDone$.set(value);

                return createElement('div', undefined, value);
            });
            function App() {
                return createElement(
                    Suspense,
                    { fallback: createElement('div', undefined, 'fallback') },
                    createElement(Test),
                );
            }
            const { container } = render(createElement(App));
            let items = container.querySelectorAll('div');
            expect(items[0].textContent).toEqual('fallback');

            expect(await when(isDone$)).toEqual('hi');
            items = container.querySelectorAll('div');
            expect(items[0].textContent).toEqual('hi');
        });
    });
    test('use$ with array length', () => {
        supressActWarning(async () => {
            const obs$ = observable<{ todos: number[]; total: number }>({
                todos: [0],
                total: (): number => obs$.todos.length,
            });
            let lastValue: number | undefined = undefined;

            const Test = function Test() {
                lastValue = use$(obs$.total);

                return createElement('div', undefined, lastValue);
            };
            function App() {
                return createElement(Test);
            }
            render(createElement(App));

            expect(lastValue).toEqual(1);
            act(() => {
                obs$.todos.push(1);
            });
            expect(lastValue).toEqual(2);
            act(() => {
                obs$.todos.splice(0, 1);
            });
            expect(lastValue).toEqual(1);
            act(() => {
                obs$.todos.set([]);
            });
            expect(lastValue).toEqual(0);
        });
    });
});

describe('For', () => {
    test('Array insert has stable reference', async () => {
        type TestObject = { id: number; label: string };
        const obs = observable({
            items: [{ id: 0, label: '0' }] as TestObject[],
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.id }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, { each: obs.items, item: Item }),
            );
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(1);

        act(() => {
            obs.items.splice(0, 0, { id: 1, label: '1' });
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('1');
    });
    test('Array insert has stable reference 2', () => {
        const obs = observable({
            items: [
                { id: 'B', label: 'B' },
                { id: 'A', label: 'A' },
            ] as TestObject[],
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.id }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, { each: obs.items, item: Item }),
            );
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);

        act(() => {
            obs.items.splice(0, 0, { id: 'C', label: 'C' } as TestObject);
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(3);
        expect(items[0].id).toEqual('C');
        expect(items[1].id).toEqual('B');
        expect(items[2].id).toEqual('A');

        act(() => {
            obs.items.splice(0, 0, { id: 'D', label: 'D' });
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(4);
        expect(items[0].id).toEqual('D');
        expect(items[1].id).toEqual('C');
        expect(items[2].id).toEqual('B');
        expect(items[3].id).toEqual('A');
    });
    test('For getObservableIndex', () => {
        const obs = observable({
            items: [
                { id: 'B', label: 'B' },
                { id: 'A', label: 'A' },
            ] as TestObject[],
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: getObservableIndex(item$) }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, { each: obs.items, item: Item }),
            );
        }
        const { container } = render(createElement(Test));

        const items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('0');
        expect(items[1].id).toEqual('1');
    });
    test('For with Map', () => {
        const obs = observable({
            items: new Map<string, TestObject>([
                ['m2', { label: 'B', id: 'B' }],
                ['m1', { label: 'A', id: 'A' }],
            ]),
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.label }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, { each: obs.items, item: Item }),
            );
        }
        const { container } = render(createElement(Test));

        const items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('B');
        expect(items[1].id).toEqual('A');
    });
    test('For with Map optimized', () => {
        const obs = observable({
            items: new Map<string, TestObject>([['m2', { label: 'B', id: 'B' }]]),
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.label }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, { each: obs.items, item: Item, optimized: true }),
            );
        }
        const { container } = render(createElement(Test));

        const items = container.querySelectorAll('li');
        expect(items.length).toEqual(1);
        expect(items[0].id).toEqual('B');

        act(() => {
            obs.items.set('m1', { label: 'A', id: 'A' });
        });

        const items2 = container.querySelectorAll('li');
        expect(items2.length).toEqual(2);
        expect(items2[0].id).toEqual('B');
        expect(items2[1].id).toEqual('A');
    });
    test('For with Map sorted', () => {
        const obs = observable({
            items: new Map<string, TestObject>([
                ['m2', { label: 'B', id: 'B' }],
                ['m1', { label: 'A', id: 'A' }],
            ]),
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.label }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, {
                    each: obs.items,
                    item: Item,
                    sortValues: (a: TestObject, b: TestObject) => a.label.localeCompare(b.label),
                }),
            );
        }
        const { container } = render(createElement(Test));

        const items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('A');
        expect(items[1].id).toEqual('B');
    });
    test('For with object and deleted', () => {
        const obs = observable({
            items: {
                m2: { label: 'B', id: 'B' },
                m1: { label: 'A', id: 'A' },
            },
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.label }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, { each: obs.items, item: Item }),
            );
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('B');
        expect(items[1].id).toEqual('A');

        act(() => {
            obs.items.m2.delete();
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(1);
        expect(items[0].id).toEqual('A');
    });
    test('Push, clear, push in For optimized', () => {
        interface ValObject {
            val: number;
        }
        const list$ = observable<ValObject[]>([0].map((i) => ({ val: i })));
        function Item({ item$ }: { item$: Observable<ValObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.val }, data.val);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<ValObject, {}>, { each: list$, item: Item, optimized: true }),
            );
        }

        const push = () => list$.push({ val: list$.get().length });

        const clear = () => list$.set([]);

        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(1);

        act(() => {
            clear();
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(0);

        act(() => {
            push();
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(1);
    });
});
describe('Show', () => {
    test('Show works correctly', async () => {
        const obs = observable({
            ok: false,
        });
        function Test() {
            return createElement(
                'div',
                undefined,
                // @ts-expect-error Not sure why it wants children in props
                createElement(Show, { if: obs.ok }, () => createElement('span', undefined, 'hi')),
            );
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('span');
        expect(items.length).toEqual(0);

        act(() => {
            obs.ok.set(true);
        });

        items = container.querySelectorAll('span');
        expect(items.length).toEqual(1);
        expect(items[0].textContent).toEqual('hi');
    });
    test('Show with function expecting value', async () => {
        const obs = observable({
            value: '',
        });
        function Test() {
            return createElement(
                'div',
                undefined,
                // @ts-expect-error Not sure why it wants children in props
                createElement(Show, { if: obs.value }, (value) => createElement('span', undefined, value)),
            );
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('span');
        expect(items.length).toEqual(0);

        act(() => {
            obs.value.set('test');
        });

        items = container.querySelectorAll('span');
        expect(items.length).toEqual(1);
        expect(items[0].textContent).toEqual('test');
    });
    test('Show if changing does not re-render', async () => {
        let numRenders = 0;
        const obs = observable({
            value: '',
        });
        function Child() {
            numRenders++;
            return createElement('span', undefined, 'hi');
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                // @ts-expect-error Not sure why it wants children in props
                createElement(Show, { if: () => !!obs.value.get() }, () => createElement(Child)),
            );
        }
        render(createElement(Test));

        act(() => {
            obs.value.set('test');
        });

        expect(numRenders).toEqual(1);

        act(() => {
            obs.value.set('test2');
        });

        expect(numRenders).toEqual(1);

        act(() => {
            obs.value.delete();
        });

        expect(numRenders).toEqual(1);

        act(() => {
            obs.value.set('test');
        });

        expect(numRenders).toEqual(2);

        act(() => {
            obs.value.set('test2');
        });

        expect(numRenders).toEqual(2);
    });
});

describe('Switch', () => {
    test('Switch does not fall through', async () => {
        const obs = observable<{ ok: string }>({
            ok: undefined as unknown as string,
        });
        let didFallThrough = false;
        function Test() {
            return createElement(
                Switch,
                // @ts-expect-error Not sure why it wants children in props
                { value: obs.ok },
                {
                    undefined: () => {
                        return null;
                    },
                    default: () => {
                        didFallThrough = true;
                        return null;
                    },
                },
            );
        }
        render(createElement(Test));

        expect(didFallThrough).toEqual(false);
    });
});
describe('useObservableReducer', () => {
    test('useObservableReducer test1', () => {
        let nextId = 3;
        const initialTasks = [
            { id: 0, text: 'Visit Kafka Museum', done: true },
            { id: 1, text: 'Watch a puppet show', done: false },
            { id: 2, text: 'Lennon Wall pic', done: false },
        ];

        function tasksReducer(tasks: any[], action: any) {
            switch (action.type) {
                case 'added': {
                    return [
                        ...tasks,
                        {
                            id: action.id,
                            text: action.text,
                            done: false,
                        },
                    ];
                }
                case 'changed': {
                    return tasks.map((t) => {
                        if (t.id === action.task.id) {
                            return action.task;
                        } else {
                            return t;
                        }
                    });
                }
                case 'deleted': {
                    return tasks.filter((t) => t.id !== action.id);
                }
                default: {
                    throw Error('Unknown action: ' + action.type);
                }
            }
        }
        const { result } = renderHook(() => {
            return useObservableReducer(tasksReducer, initialTasks);
        });
        const [observableTasks, dispatch] = result.current;

        expect(observableTasks.get()).toEqual([
            { id: 0, text: 'Visit Kafka Museum', done: true },
            { id: 1, text: 'Watch a puppet show', done: false },
            { id: 2, text: 'Lennon Wall pic', done: false },
        ]);

        dispatch({
            type: 'added',
            id: nextId++,
            text: 'test',
        });

        expect(observableTasks.get()).toEqual([
            { id: 0, text: 'Visit Kafka Museum', done: true },
            { id: 1, text: 'Watch a puppet show', done: false },
            { id: 2, text: 'Lennon Wall pic', done: false },
            { id: 3, text: 'test', done: false },
        ]);
    });
});

describe('useObserve', () => {
    test('useObserve runs twice in StrictMode', () => {
        let num = 0;
        function Test() {
            useObserve(() => {
                num++;
            });
            return createElement('div', undefined);
        }
        function App() {
            return createElement(StrictMode, undefined, createElement(Test));
        }
        render(createElement(App));

        expect(num).toEqual(2);
    });
    test('useObserve with true and setState sets once', () => {
        let num = 0;
        let numSets = 0;
        function Test() {
            const [, setValue] = useState(0);
            num++;
            useObserve(true, () => {
                numSets++;
                setValue((v) => v + 1);
            });
            return createElement('div', undefined);
        }
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(2);
        expect(numSets).toEqual(1);
    });
    test('useObserve with false and setState sets once', () => {
        let num = 0;
        let numSets = 0;
        function Test() {
            const [, setValue] = useState(0);
            num++;
            useObserve(false, () => {
                numSets++;
                setValue((v) => v + 1);
            });
            return createElement('div', undefined);
        }
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(2);
        expect(numSets).toEqual(1);
    });
    test('useObserve with undefined never calls reaction', () => {
        let num = 0;
        let numSets = 0;
        function Test() {
            const [, setValue] = useState(0);
            num++;
            useObserve(undefined, () => {
                numSets++;
                setValue((v) => v + 1);
            });
            return createElement('div', undefined);
        }
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(numSets).toEqual(0);
    });
    test('useObserve with undefined observable calls reaction', () => {
        let num = 0;
        let numObserves = 0;
        const obs$ = observable<number | undefined>(undefined);
        function Test() {
            num++;
            useObserve(obs$, () => {
                numObserves++;
            });
            return createElement('div', undefined);
        }
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(numObserves).toEqual(0);

        obs$.set(1);

        expect(num).toEqual(1);
        expect(numObserves).toEqual(1);
    });
    test('useObserve with a deps array', () => {
        let num = 0;
        let numInner = 0;
        const obsOuter$ = observable(0);
        const obsInner$: Observable = observable(0);
        let lastObserved: number | undefined = undefined;
        const Test = observer(function Test() {
            const dep = obsOuter$.get();
            useObserve(
                () => {
                    numInner++;
                    lastObserved = obsInner$.get();
                },
                { deps: [dep] },
            );
            num++;

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(numInner).toEqual(1);
        expect(lastObserved).toEqual(0);

        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(2);
        expect(lastObserved).toEqual(0);

        // If inner dep changes it should run again without rendering
        act(() => {
            obsInner$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(3);
        expect(lastObserved).toEqual(1);

        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(2);
        });

        expect(num).toEqual(3);
        expect(numInner).toEqual(4);
        expect(lastObserved).toEqual(1);
    });
});

describe('useObserveEffect', () => {
    test('useObserveEffect runs once in StrictMode', () => {
        let num = 0;
        function Test() {
            useObserveEffect(() => {
                num++;
            });
            return createElement('div', undefined);
        }
        function App() {
            return createElement(StrictMode, undefined, createElement(Test));
        }
        render(createElement(App));

        expect(num).toEqual(1);
    });
    test('useObserveEffect updates with changes', () => {
        let num = 0;
        const state$ = observable(0);
        function Test() {
            useObserveEffect(() => {
                state$.get();
                num++;
            });
            return createElement('div', undefined);
        }
        function App() {
            return createElement(StrictMode, undefined, createElement(Test));
        }
        render(createElement(App));

        expect(num).toEqual(1);

        state$.set((v) => v + 1);
        expect(num).toEqual(2);

        state$.set((v) => v + 1);
        expect(num).toEqual(3);
    });
    test('useObserve with a deps array', () => {
        let num = 0;
        let numInner = 0;
        const obsOuter$ = observable(0);
        const obsInner$: Observable = observable(0);
        let lastObserved: number | undefined = undefined;
        const Test = observer(function Test() {
            const dep = obsOuter$.get();
            useObserveEffect(
                () => {
                    numInner++;
                    lastObserved = obsInner$.get();
                },
                { deps: [dep] },
            );
            num++;

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(numInner).toEqual(1);
        expect(lastObserved).toEqual(0);

        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(2);
        expect(lastObserved).toEqual(0);

        // If inner dep changes it should run again without rendering
        act(() => {
            obsInner$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(3);
        expect(lastObserved).toEqual(1);

        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(2);
        });

        expect(num).toEqual(3);
        expect(numInner).toEqual(4);
        expect(lastObserved).toEqual(1);
    });
});

describe('observer', () => {
    test('observer basic', () => {
        let num = 0;
        const obs$ = observable(0);
        const Test = observer(function Test() {
            obs$.get();
            num++;

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);

        act(() => {
            obs$.set(1);
        });

        expect(num).toEqual(2);
    });
    test('observer with useSelector inside', () => {
        let num = 0;
        const obs$ = observable(0);
        const Test = observer(function Test() {
            useSelector(obs$);
            useSelector(obs$);
            num++;

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);

        act(() => {
            obs$.set(1);
        });

        expect(num).toEqual(2);
    });
    test('useSelector renders once when it returns the same thing inside an observer', () => {
        const obs = observable('hi');
        let num = 0;
        let num2 = 0;
        let lastValue = false;

        const Test = observer(function Test() {
            num2++;
            lastValue = useSelector(() => {
                num++;
                return obs.get() === 'hi';
            });

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(lastValue).toEqual(true);
        expect(num).toEqual(1);
        expect(num2).toEqual(1);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(3);
        expect(num2).toEqual(2);
        act(() => {
            obs.set('hello2');
        });
        expect(num).toEqual(4);
        expect(num2).toEqual(2);
    });
});
describe('useObservable', () => {
    test('useObservable with an object', () => {
        let num = 0;
        let obs$: Observable<{ test: number }>;
        let value = 0;
        const Test = observer(function Test() {
            obs$ = useObservable({ test: 0 });
            num++;

            value = obs$.test.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(value).toEqual(0);

        act(() => {
            obs$.test.set(1);
        });

        expect(num).toEqual(2);
        expect(value).toEqual(1);
    });
    test('useObservable with a function', () => {
        let num = 0;
        let obs$: Observable<{ test: number }>;
        let value = 0;
        const Test = observer(function Test() {
            obs$ = useObservable(() => ({ test: 0 }));
            num++;

            value = obs$.test.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(value).toEqual(0);

        act(() => {
            obs$.test.set(1);
        });

        expect(num).toEqual(2);
        expect(value).toEqual(1);
    });
    test('useObservable with a computed function', () => {
        let num = 0;
        const obs$: Observable = observable(0);
        let value = 0;
        const Test = observer(function Test() {
            const obsLocal$ = useObservable(() => obs$.get());
            num++;

            value = obsLocal$.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(value).toEqual(0);

        act(() => {
            obs$.set(1);
        });

        expect(num).toEqual(2);
        expect(value).toEqual(1);
    });
    test('useObservable with a deps array', () => {
        let num = 0;
        let numInner = 0;
        const obs$: Observable = observable(0);
        let value: string = '';
        let deps = ['hi'];
        const Test = observer(function Test() {
            obs$.get();
            const obsLocal$ = useObservable(() => {
                numInner++;
                return deps[0];
            }, deps);
            num++;

            value = obsLocal$.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(numInner).toEqual(1);
        expect(value).toEqual('hi');

        // If deps array changes it should refresh observable

        act(() => {
            deps = ['hello'];
            obs$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(2);
        expect(value).toEqual('hello');

        // If deps array doesn't change it should not refresh
        act(() => {
            deps = ['hello'];
            obs$.set(2);
        });

        expect(num).toEqual(3);
        expect(numInner).toEqual(2);
        expect(value).toEqual('hello');
    });
    test('useObservable with a deps array of objects', () => {
        let num = 0;
        let numInner = 0;
        const obs$: Observable = observable(0);
        let value: { text: string } | undefined = undefined;
        let deps = [{ text: 'hi' }];
        const Test = observer(function Test() {
            obs$.get();
            const obsLocal$ = useObservable(() => {
                numInner++;
                return deps[0];
            }, deps);
            num++;

            value = obsLocal$.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(numInner).toEqual(1);
        expect(value).toEqual({ text: 'hi' });

        // If deps array changes it should refresh observable

        act(() => {
            deps = [{ text: 'hello' }];
            obs$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(2);
        expect(value).toEqual({ text: 'hello' });

        // If deps array doesn't change it should not refresh
        act(() => {
            deps = [{ text: 'hello' }];
            obs$.set(2);
        });

        expect(num).toEqual(3);
        expect(numInner).toEqual(2);
        expect(value).toEqual({ text: 'hello' });
    });
    test('useObservable with a lookup table and empty deps array', () => {
        let num = 0;
        let numInner = 0;
        const obs$: Observable = observable(0);
        let value: string = '';
        const deps: string[] = [];
        const Test = observer(function Test() {
            const obsLocal$ = useObservable((p: string) => {
                numInner++;
                return p + obs$.get();
            }, deps);
            num++;

            value = obsLocal$.a.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(numInner).toEqual(1);
        expect(value).toEqual('a0');

        act(() => {
            obs$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(2);
        expect(value).toEqual('a1');

        act(() => {
            obs$.set(2);
        });

        expect(num).toEqual(3);
        expect(numInner).toEqual(3);
        expect(value).toEqual('a2');
    });
    test('useComputed with a deps array', () => {
        let num = 0;
        const obs$: Observable = observable(0);
        let value: string = '';
        let deps = ['hi'];
        let setTo: any = undefined;
        let obsLocal$: Observable<string> | undefined = undefined;
        const Test = observer(function Test() {
            obs$.get();
            obsLocal$ = useComputed(
                () => {
                    return deps[0];
                },
                (value) => {
                    setTo = value;
                },
                deps,
            );
            num++;

            value = obsLocal$.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(value).toEqual('hi');

        act(() => {
            deps = ['hello'];
            obs$.set(1);
        });

        expect(num).toEqual(2);
        expect(value).toEqual('hello');

        act(() => {
            deps = ['hello2'];
            obs$.set(2);
        });

        expect(num).toEqual(3);
        expect(value).toEqual('hello2');

        act(() => {
            obsLocal$!.set('test');
        });

        expect(setTo).toEqual('test');
    });
    test('useComputed vs observable deep object set', () => {
        // From: https://github.com/LegendApp/legend-state/issues/305
        const o$ = observable([{ hotspot: { position: { x: 0 } } }]);
        let numRenders = 0;
        let lastValue:
            | undefined
            | {
                  hotspot: {
                      position: {
                          x: number;
                      };
                  };
              }[] = undefined;
        const Test = observer(function Test() {
            const c$ = useComputed(() => {
                return o$;
            }, []);
            if (numRenders === 0) {
                lastValue = o$.get();
            } else {
                lastValue = c$.get();
            }
            numRenders++;

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(lastValue).toEqual([{ hotspot: { position: { x: 0 } } }]);

        act(() => {
            o$[0].hotspot.position.x.set(2);
        });

        expect(numRenders).toEqual(2);
        expect(lastValue).toEqual([{ hotspot: { position: { x: 2 } } }]);

        act(() => {
            o$.set([{ hotspot: { position: { x: 1 } } }]);
        });

        expect(numRenders).toEqual(3);
        expect(lastValue).toEqual([{ hotspot: { position: { x: 1 } } }]);

        act(() => {
            o$[0].hotspot.position.x.set(3);
        });

        expect(numRenders).toEqual(4);
        expect(lastValue).toEqual([{ hotspot: { position: { x: 3 } } }]);
    });
    test('useObservable with a synced does not recreate get function', async () => {
        let num = 0;
        let obs$: Observable<{ test: number }>;
        const obs2$ = observable(0);
        let value = 0;
        let latestRand: number | undefined = undefined;
        const Test = observer(function Test() {
            const rand = { value: Math.random() };
            latestRand = rand.value;
            // @ts-expect-error TODO: Fix this
            obs$ = useObservable(
                synced({
                    get: () => {
                        obs2$.get();
                        return { test: num + '_' + rand.value };
                    },
                }),
            );
            num++;

            value = obs$.test.get();

            obs2$.get();

            return createElement('div', undefined);
        });
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        const originalRand = latestRand;

        expect(num).toEqual(1);
        expect(value).toEqual(1 + '_' + originalRand);

        act(() => {
            obs2$.set(1);
        });

        await promiseTimeout(0);

        expect(num).toEqual(2);
        expect(value).toEqual(1 + '_' + originalRand);
    });
});
describe('useObservableState', () => {
    test('useObservableState does not select if value not accessed', () => {
        let num = 0;
        let obs$: Observable<number>;
        const Test = function Test() {
            const [obsLocal$] = useObservableState(0);
            num++;

            obs$ = obsLocal$;

            return createElement('div', undefined);
        };
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);

        act(() => {
            obs$.set(1);
        });

        expect(num).toEqual(1);
    });
    test('useObservableState select if value accessed', () => {
        let num = 0;
        let obs$: Observable<number>;
        let value = 0;
        const Test = function Test() {
            const [obsLocal$, valueLocal] = useObservableState(0);
            num++;

            obs$ = obsLocal$;
            value = valueLocal;

            return createElement('div', undefined);
        };
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        expect(value).toEqual(0);

        act(() => {
            obs$.set(1);
        });

        expect(num).toEqual(2);
        expect(value).toEqual(1);
    });
});
describe('Reactive', () => {
    test('Reactive div $className', () => {
        const obs$ = observable('hi');
        let num = 0;
        const Test = function Test() {
            return createElement(Reactive.div, {
                $className: () => {
                    num++;
                    return obs$.get();
                },
            });
        };
        function App() {
            return createElement(Test);
        }
        render(createElement(App));

        expect(num).toEqual(1);
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('div');
        expect(items.length).toEqual(1);
        expect(items[0].className).toEqual('hi');

        act(() => {
            obs$.set('hello');
        });

        items = container.querySelectorAll('div');

        expect(items[0].className).toEqual('hello');

        // items = container.querySelectorAll('li');
        // expect(items.length).toEqual(2);
        // expect(items[0].id).toEqual('1');
    });
});

describe('Memo', () => {
    test('Memo works with function returning function', () => {
        let num = 0;
        let obs$: Observable<boolean>;
        function A() {
            return 'AA';
        }
        function B() {
            return 'BB';
        }
        const Test = function Test() {
            const [obsLocal$] = useObservableState(true);
            num++;

            obs$ = obsLocal$;

            return createElement('div', undefined, <Memo>{(() => (obsLocal$.get() ? A : B)) as any}</Memo>);
        };

        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('div');

        expect(items[0].textContent).toEqual('AA');

        expect(num).toEqual(1);

        act(() => {
            obs$.set(false);
        });

        expect(num).toEqual(1);

        items = container.querySelectorAll('div');
        expect(items[0].textContent).toEqual('BB');
    });
    test('Memo works with a string', () => {
        const obs$ = observable({ test: 'hi' });
        const Test = function Test() {
            return (
                <div>
                    <Memo>{obs$.test}</Memo>
                </div>
            );
        };

        const { container } = render(createElement(Test));

        const items = container.querySelectorAll('div');

        expect(items[0].textContent).toEqual('hi');

        act(() => {
            obs$.test.set('hello');
        });

        expect(items[0].textContent).toEqual('hello');
    });
});
describe('react validation', () => {
    test('react validation', () => {
        // A subset of React's dev validation to make sure nothing breaks in there
        function getIteratorFn(maybeIterable: any) {
            const MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
            const FAUX_ITERATOR_SYMBOL = '@@iterator';
            if (maybeIterable === null || typeof maybeIterable !== 'object') {
                return null;
            }

            const maybeIterator =
                (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) || maybeIterable[FAUX_ITERATOR_SYMBOL];

            if (typeof maybeIterator === 'function') {
                return maybeIterator;
            }

            return null;
        }

        function validateChildKeys(node: any) {
            if (node) {
                const iteratorFn = getIteratorFn(node);

                if (typeof iteratorFn === 'function') {
                    // Entry iterators used to provide implicit keys,
                    // but now we print a separate warning for them later.
                    if (iteratorFn !== node.entries) {
                        const iterator = iteratorFn.call(node);
                        expect(iterator).not.toBe(undefined);
                    }
                }
            }
        }

        const obs$ = observable({ test: 'hello' });
        validateChildKeys(obs$.test);
    });
});
describe('tracing', () => {
    beforeEach(() => {
        // Mock console.log before each test
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console.log after each test
        (console.log as jest.Mock).mockRestore();
    });
    test('useTraceListeners', () => {
        const obs$ = observable(0);
        const Test = observer(function Test() {
            useTraceListeners();
            obs$.get();
            return createElement('div', undefined);
        });
        render(createElement(Test));

        expect(console.log).toHaveBeenCalledWith(`[legend-state] tracking 1 observable:
1: `);

        // If deps array changes it should refresh observable
        act(() => {
            obs$.set(1);
        });

        expect(console.log).toHaveBeenCalledWith(`[legend-state] tracking 1 observable:
1: `);
    });
    test('useTraceUpdates', () => {
        const obs$ = observable(0);
        const Test = observer(function Test() {
            useTraceUpdates();
            obs$.get();
            return createElement('div', undefined);
        });
        render(createElement(Test));

        // If deps array changes it should refresh observable
        act(() => {
            obs$.set(1);
        });

        expect(console.log).toHaveBeenCalledWith(`[legend-state] Rendering because "" changed:
from: 0
to: 1`);
    });
});
