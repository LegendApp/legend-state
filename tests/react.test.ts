/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, render, renderHook } from '@testing-library/react';
import { createElement, useReducer } from 'react';
import { getObservableIndex } from '../src/helpers';
import { observable } from '../src/observable';
import { Observable } from '../src/observableInterfaces';
import { enableLegendStateReact } from '../src/react/enableLegendStateReact';
import { For } from '../src/react/flow';
import { useObservableReducer } from '../src/react/useObservableReducer';
import { useSelector } from '../src/react/useSelector';

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
        // Goes up by two because it runs, decides to re-render, and runs again
        expect(num).toEqual(3);
        expect(result.current).toEqual('hello there');
        act(() => {
            obs.set('z');
        });
        expect(num).toEqual(5);
        expect(result.current).toEqual('z there');
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
        expect(num).toEqual(3);
        expect(result.current).toEqual('hello2 there');
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(5);
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
        expect(num).toEqual(3);
        expect(result.current).toEqual('a b there');
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(5);
        expect(result.current).toEqual('hello b there');
        act(() => {
            obs2.set('z');
        });
        expect(num).toEqual(7);
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
        expect(num).toEqual(2);
        expect(result.current).toEqual('hi there');

        act(() => {
            obs.set('b');
        });

        expect(num).toEqual(2);
    });
    test('useSelector with forceRender', () => {
        const obs = observable('hi');
        let num = 0;
        let numSelects = 0;
        let fr;
        function Test() {
            fr = useReducer((s) => s + 1, 0)[1];
            const val = useSelector(() => {
                numSelects++;
                return obs.get() + ' there';
            });
            num++;

            return createElement('div', { children: val });
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

        expect(num).toEqual(2);
        expect(numSelects).toEqual(3);

        act(() => {
            fr();
            fr();
            obs.set('hello2');
            obs.set('hello3');
            obs.set('hello4');
            fr();
            fr();
        });

        expect(num).toEqual(3);
        expect(numSelects).toEqual(5);
    });
});

describe('For', () => {
    test('Array insert has stable reference', async () => {
        const obs = observable({
            items: [{ id: 0, label: '0' }] as Array<{ id: number; label: string }>,
        });
        function Item({ item }) {
            const data = useSelector(item);
            return createElement('li', { id: data.id }, data.label);
        }
        function Test() {
            return createElement('div', { children: createElement(For, { each: obs.items, item: Item }) });
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
        enableLegendStateReact();
        const obs = observable({
            items: [
                { id: 'B', label: 'B' },
                { id: 'A', label: 'A' },
            ] as Array<{ id: string; label: string }>,
        });
        function Item({
            item,
        }: {
            item: Observable<{
                id: number;
                label: string;
            }>;
        }) {
            const data = useSelector(item);
            return createElement('li', { id: data.id }, data.label);
        }
        function Test() {
            return createElement('div', { children: createElement(For, { each: obs.items, item: Item }) });
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);

        act(() => {
            obs.items.splice(0, 0, { id: 'C', label: 'C' });
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
            ] as Array<{ id: string; label: string }>,
        });
        function Item({
            item,
        }: {
            item: Observable<{
                id: number;
                label: string;
            }>;
        }) {
            const data = useSelector(item);
            return createElement('li', { id: getObservableIndex(item) }, data.label);
        }
        function Test() {
            return createElement('div', { children: createElement(For, { each: obs.items, item: Item }) });
        }
        const { container } = render(createElement(Test));

        const items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('0');
        expect(items[1].id).toEqual('1');
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

        function tasksReducer(tasks, action) {
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
