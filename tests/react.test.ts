/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, render, renderHook } from '@testing-library/react';
import { createElement, useReducer } from 'react';
import { For } from '../src/react/flow';
import { observable } from '../src/observable';
import { useSelector } from '../src/react/useSelector';
import { enableLegendStateReact } from '../src/react/enableLegendStateReact';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

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
});

describe('For', () => {
    test('Array insert has stable reference', () => {
        enableLegendStateReact();
        const obs = observable({
            items: [{ id: 0, label: '0' }] as Array<{ id: number; label: string }>,
        });
        function Item({ item }) {
            return createElement('li', { id: item.id.get() }, item.label.get());
        }
        function Test() {
            return createElement('div', { children: createElement(For, { each: obs.items, item: Item }) });
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(1);

        act(() => {
            // debugger;
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
                { id: 0, label: '0' },
                { id: 1, label: '1' },
            ] as Array<{ id: number; label: string }>,
        });
        function Item({ item }) {
            return createElement('li', { id: item.id.get() }, item.label.get());
        }
        function Test() {
            return createElement('div', { children: createElement(For, { each: obs.items, item: Item }) });
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);

        act(() => {
            // debugger;
            obs.items.splice(1, 0, { id: 2, label: '2' });
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(3);
        expect(items[0].id).toEqual('0');
        expect(items[1].id).toEqual('2');
        expect(items[2].id).toEqual('1');
    });
});
