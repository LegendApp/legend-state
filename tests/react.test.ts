/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, render, renderHook } from '@testing-library/react';
import { StrictMode, createElement, useReducer, useState } from 'react';
import { getObservableIndex } from '../src/helpers';
import { observable } from '../src/observable';
import { Observable } from '../src/observableInterfaces';
import { For } from '../src/react/For';
import { Show } from '../src/react/Show';
import { observer } from '../src/react/reactive-observer';
import { useObservableReducer } from '../src/react/useObservableReducer';
import { useObserve } from '../src/react/useObserve';
import { useObserveEffect } from '../src/react/useObserveEffect';
import { useSelector } from '../src/react/useSelector';
import { useObservableState } from '../src/react/useObservableState';

type TestObject = { id: string; label: string };

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
});

describe('For', () => {
    test('Array insert has stable reference', async () => {
        type TestObject = { id: number; label: string };
        const obs = observable({
            items: [{ id: 0, label: '0' }] as TestObject[],
        });
        function Item({ item }: { item: Observable<TestObject> }) {
            const data = useSelector(item);
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
        function Item({ item }: { item: Observable<TestObject> }) {
            const data = useSelector(item);
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
        function Item({ item }: { item: Observable<TestObject> }) {
            const data = useSelector(item);
            return createElement('li', { id: getObservableIndex(item) }, data.label);
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
        function Item({ item }: { item: Observable<TestObject> }) {
            const data = useSelector(item);
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
    test('For with Map sorted', () => {
        const obs = observable({
            items: new Map<string, TestObject>([
                ['m2', { label: 'B', id: 'B' }],
                ['m1', { label: 'A', id: 'A' }],
            ]),
        });
        function Item({ item }: { item: Observable<TestObject> }) {
            const data = useSelector(item);
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
