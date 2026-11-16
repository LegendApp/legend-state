import { internal } from '../index';
import { configureLegendState } from '../src/config/configureLegendState';
import { enableReactTracking } from '../src/config/enableReactTracking';
import { act, render, renderHook, waitFor } from '@testing-library/react';
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
import { use$, useSelector, useValue } from '../src/react/useSelector';
import { getNode } from '../src/globals';
import { tracking } from '../src/tracking';
import { Memo } from '../src/react/Memo';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { useComputed } from '../src/react/useComputed';
import { when } from '../src/when';
import { promiseTimeout, supressActWarning } from './testglobals';
import { synced } from '../src/sync/synced';
import { useTraceListeners } from '../src/trace/useTraceListeners';
import { useTraceUpdates } from '../src/trace/useTraceUpdates';
import { $React } from '@legendapp/state/react-web';
import { syncObservable } from '../sync';
import { createObservableHook } from '../src/react-hooks/createObservableHook';

type TestObject = { id: string; label: string };

if (typeof document === 'undefined') {
    GlobalRegistrator.register();
}

async function captureConsoleErrors(fn: () => void | Promise<void>) {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
        errors.push(args.map(String).join(' '));
    };

    try {
        await fn();
    } finally {
        console.error = originalError;
    }

    return errors;
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
    test('useSelector with computed', () => {
        const obs = observable({ value: 'hi', computed: () => obs.value.get() + ' there' });
        const { result } = renderHook(() => {
            return useSelector(obs.computed);
        });

        act(() => {
            obs.value.set('hello');
        });
        expect(result.current).toEqual('hello there');
        act(() => {
            obs.value.set('z');
        });
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
    test('useSelector refreshes after strict effect replay', () => {
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

        // StrictMode doubles both the initial render and the reconnect render.
        expect(num).toEqual(4);
        act(() => {
            obs.set('hello');
        });
        expect(num).toEqual(8);
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
        expect(num).toEqual(4);
        act(() => {
            obs.set('hello');
        });
        expect(numListeners()).toEqual(2);
        expect(num).toEqual(6);
        act(() => {
            obs.set('z');
        });
        expect(numListeners()).toEqual(2);
        expect(num).toEqual(8);
        act(() => {
            obs.set('q');
        });
        expect(numListeners()).toEqual(2);
        expect(num).toEqual(10);
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
    test('suspense without observer', async () => {
        await supressActWarning(async () => {
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
    test('suspense with observer', async () => {
        await supressActWarning(async () => {
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
    test('suspense thrown inside observer leaves no tracking behind', async () => {
        await supressActWarning(async () => {
            let isResolved = false;
            const promise = new Promise<void>((resolve) =>
                setTimeout(() => {
                    isResolved = true;
                    resolve();
                }, 10),
            );
            const obs$ = observable({ value: 'hi' });
            const isDone$ = observable(false);
            const Test = observer(function Test() {
                const value = obs$.value.get();
                // A suspending hook from outside Legend-State (a data library's useSuspenseQuery)
                // throws its promise from inside the observed render
                if (!isResolved) {
                    throw promise;
                }
                isDone$.set(true);

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
            // The suspended render's tracker must not stay current, or every later get()
            // anywhere would keep adding nodes to it. Compared as a boolean: printing a
            // leaked tracker on failure would walk its proxies forever.
            expect(tracking.current === undefined).toBe(true);

            expect(await when(isDone$)).toEqual(true);
            items = container.querySelectorAll('div');
            expect(items[0].textContent).toEqual('hi');
            expect(tracking.current === undefined).toBe(true);
        });
    });
    test('use$ with array length', async () => {
        await supressActWarning(async () => {
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
    test('use$ with array length', () => {
        async () => {
            const obs$ = observable<{ test: number[] }>({
                test: [0],
            });
            let lastValue: number[] | undefined = undefined;

            const Test = function Test() {
                lastValue = use$(obs$).test;

                return createElement('div', undefined, lastValue);
            };
            function App() {
                return createElement(Test);
            }
            render(createElement(App));

            expect(lastValue).toEqual([0]);
            act(() => {
                obs$.assign({ test: [1] });
            });
            expect(lastValue).toEqual([1]);
            act(() => {
                obs$.assign({ test: [1, 2, 3] });
            });
            expect(lastValue).toEqual([1, 2, 3]);
            act(() => {
                obs$.assign({ test: [] });
            });
            expect(lastValue).toEqual([]);
        };
    });
    test('useSelector notifies synchronously outside render', () => {
        const obs = observable('hi');
        const { result } = renderHook(() => useSelector(obs));

        expect(result.current).toEqual('hi');
        act(() => {
            obs.set('hello');
        });
        expect(result.current).toEqual('hello');
    });
    test('useSelector defers useObserve render updates', async () => {
        const errors = await captureConsoleErrors(async () => {
            const sideEffect$ = observable(0);
            const showTrigger$ = observable(false);

            let sideEffectValue: number | undefined;
            const CompB = function CompB() {
                sideEffectValue = useSelector(sideEffect$);
                return createElement('div', undefined, sideEffectValue);
            };

            const CompTrigger = function CompTrigger() {
                useObserve(() => {
                    sideEffect$.set(10);
                });
                return createElement('div', undefined);
            };

            const App = function App() {
                const show = useSelector(showTrigger$);
                return createElement('div', undefined, createElement(CompB), show ? createElement(CompTrigger) : null);
            };

            render(createElement(App));
            expect(sideEffectValue).toEqual(0);

            await act(async () => {
                showTrigger$.set(true);
            });
            await promiseTimeout(0);

            expect(sideEffectValue).toEqual(10);
        });

        expect(errors).toEqual([]);
    });
    test('useSelector defers useObservable dependency render updates', async () => {
        const errors = await captureConsoleErrors(async () => {
            const sideEffect$ = observable(0);
            const trigger$ = observable(0);

            let sideEffectValue: number | undefined;
            const CompB = function CompB() {
                sideEffectValue = useSelector(sideEffect$);
                return createElement('div', undefined, sideEffectValue);
            };

            const CompTrigger = function CompTrigger({ value }: { value: number }) {
                const local$ = useObservable(() => {
                    sideEffect$.set(value);
                    return value;
                }, [value]);
                useSelector(local$);
                return createElement('div', undefined);
            };

            const App = function App() {
                const value = useSelector(trigger$);
                return createElement('div', undefined, createElement(CompB), createElement(CompTrigger, { value }));
            };

            render(createElement(App));
            expect(sideEffectValue).toEqual(0);

            await act(async () => {
                trigger$.set(1);
            });
            await promiseTimeout(0);

            expect(sideEffectValue).toEqual(1);
        });

        expect(errors).toEqual([]);
    });
    test('useSelector defers createObservableHook render updates', async () => {
        const errors = await captureConsoleErrors(async () => {
            const sideEffect$ = observable(0);
            const showTrigger$ = observable(false);
            const useTestHook = createObservableHook((value: number) => {
                React.useState(value);
                sideEffect$.set(value);
                return value;
            });

            let sideEffectValue: number | undefined;
            const CompB = function CompB() {
                sideEffectValue = useSelector(sideEffect$);
                return createElement('div', undefined, sideEffectValue);
            };

            const CompTrigger = function CompTrigger() {
                useTestHook(10);
                return createElement('div', undefined);
            };

            const App = function App() {
                const show = useSelector(showTrigger$);
                return createElement('div', undefined, createElement(CompB), show ? createElement(CompTrigger) : null);
            };

            render(createElement(App));
            expect(sideEffectValue).toEqual(0);

            await act(async () => {
                showTrigger$.set(true);
            });
            await promiseTimeout(0);

            expect(sideEffectValue).toEqual(10);
        });

        expect(errors).toEqual([]);
    });
    test('useSelector coalesces Legend-owned render updates', async () => {
        const sideEffect$ = observable(0);
        const showTrigger$ = observable(false);

        let sideEffectValue: number | undefined;
        let sideEffectRenderCount = 0;
        const CompB = React.memo(function CompB() {
            sideEffectRenderCount++;
            sideEffectValue = useSelector(sideEffect$);
            return createElement('div', undefined, sideEffectValue);
        });

        const CompTrigger = function CompTrigger() {
            useObserve(() => {
                sideEffect$.set(10);
                sideEffect$.set(20);
                sideEffect$.set(30);
            });
            return createElement('div', undefined);
        };

        const App = function App() {
            const show = useSelector(showTrigger$);
            return createElement('div', undefined, createElement(CompB), show ? createElement(CompTrigger) : null);
        };

        render(createElement(App));
        expect(sideEffectValue).toEqual(0);
        expect(sideEffectRenderCount).toEqual(1);

        await act(async () => {
            showTrigger$.set(true);
        });
        await promiseTimeout(0);

        expect(sideEffectValue).toEqual(30);
        expect(sideEffectRenderCount).toEqual(2);
    });
    test('useSelector ignores deferred render update after unsubscribe', async () => {
        const errors = await captureConsoleErrors(async () => {
            const sideEffect$ = observable(0);
            const showTrigger$ = observable(false);

            let sideEffectRenderCount = 0;
            const CompB = function CompB() {
                sideEffectRenderCount++;
                useSelector(sideEffect$);
                return createElement('div', undefined);
            };

            const CompTrigger = function CompTrigger() {
                useObserve(() => {
                    sideEffect$.set(1);
                });
                return createElement('div', undefined);
            };

            const App = function App() {
                const show = useSelector(showTrigger$);
                return createElement('div', undefined, show ? createElement(CompTrigger) : createElement(CompB));
            };

            render(createElement(App));
            expect(sideEffectRenderCount).toEqual(1);

            await act(async () => {
                showTrigger$.set(true);
            });
            await promiseTimeout(0);

            expect(sideEffectRenderCount).toEqual(1);
        });

        expect(errors).toEqual([]);
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
    test.each(
        [false, true].flatMap((optimized) =>
            ['array', 'object', 'Map'].map((collection) => ({ optimized, collection })),
        ),
    )('For renders null and falsy $collection rows, optimized=$optimized', ({ optimized, collection }) => {
        type Value = string | number | boolean | null | undefined;
        const values: Value[] = ['ok', null, 0, false, '', undefined];
        const entries = values.map((value, index) => [String(index), value] as const);
        const each =
            collection === 'array'
                ? observable(values)
                : collection === 'object'
                  ? observable<Record<string, Value>>(Object.fromEntries(entries))
                  : observable(new Map(entries));
        function Item({ item$ }: { item$: Observable<Value> }) {
            return createElement('li', undefined, String(useSelector(item$)));
        }
        const { container } = render(createElement(For as typeof For<Value, {}>, { each, item: Item, optimized }));
        expect(Array.from(container.querySelectorAll('li')).map((el) => el.textContent)).toEqual([
            'ok',
            'null',
            '0',
            'false',
            '',
        ]);
    });
    test.each(['array', 'object', 'Map'])('For children render null and falsy %s rows', (collection) => {
        type Value = number | boolean | null;
        const values: Value[] = [0, null, false];
        const entries = values.map((value, index) => [String(index), value] as const);
        const each =
            collection === 'array'
                ? observable(values)
                : collection === 'object'
                  ? observable<Record<string, Value>>(Object.fromEntries(entries))
                  : observable(new Map(entries));
        const { container } = render(
            <For<Value, {}> each={each}>{(item$) => createElement('li', undefined, String(item$.get()))}</For>,
        );
        expect(Array.from(container.querySelectorAll('li')).map((el) => el.textContent)).toEqual([
            '0',
            'null',
            'false',
        ]);
    });
    test.each([false, true])('For keeps nullable row subscriptions, optimized=%s', (optimized) => {
        type Value = string | number | boolean | null;
        const each = observable<Value[]>([null, 'stable']);
        const renders: Record<string, number> = {};
        function Item({ item$, id }: { item$: Observable<Value>; id?: string }) {
            renders[id!] = (renders[id!] || 0) + 1;
            return createElement('li', undefined, String(useSelector(item$)));
        }
        const { container } = render(createElement(For as typeof For<Value, {}>, { each, item: Item, optimized }));
        const stableRenders = renders[1];
        expect(container.querySelector('li')!.textContent).toBe('null');
        for (const value of [0, false, '', null]) {
            act(() => each[0].set(value));
            expect(container.querySelectorAll('li').length).toBe(2);
            expect(container.querySelector('li')!.textContent).toBe(String(value));
            expect(renders[1]).toBe(stableRenders);
        }
    });
    test.each([false, true])('For skips undefined and array holes, optimized=%s', (optimized) => {
        const values = new Array<number | null | undefined>(4);
        values[1] = null;
        values[2] = undefined;
        values[3] = 0;
        const each = observable(values);
        function Item({ item$ }: { item$: Observable<number | null | undefined> }) {
            return createElement('li', undefined, String(useSelector(item$)));
        }
        const { container } = render(
            createElement(For as typeof For<number | null | undefined, {}>, { each, item: Item, optimized }),
        );
        expect(Array.from(container.querySelectorAll('li')).map((el) => el.textContent)).toEqual(['null', '0']);
    });
    test.each([false, true])('For removes and reinserts null record rows, optimized=%s', (optimized) => {
        const each = observable<Record<string, string | null>>({ a: 'stable', b: null });
        function Item({ item$ }: { item$: Observable<string | null> }) {
            return createElement('li', undefined, String(useSelector(item$)));
        }
        const { container } = render(
            createElement(For as typeof For<string | null, {}>, { each, item: Item, optimized }),
        );
        expect(container.querySelectorAll('li').length).toBe(2);
        act(() => each.b.delete());
        expect(container.querySelectorAll('li').length).toBe(1);
        act(() => each.b.set(null));
        expect(Array.from(container.querySelectorAll('li')).map((el) => el.textContent)).toEqual(['stable', 'null']);
    });
    test.each([false, true])('For removes and reinserts null Map rows, optimized=%s', (optimized) => {
        const each = observable(
            new Map<string, string | null>([
                ['a', 'stable'],
                ['b', null],
            ]),
        );
        function Item({ item$ }: { item$: Observable<string | null> }) {
            return createElement('li', undefined, String(useSelector(item$)));
        }
        const { container } = render(
            createElement(For as typeof For<string | null, {}>, { each, item: Item, optimized }),
        );
        expect(container.querySelectorAll('li').length).toBe(2);
        act(() => each.delete('b'));
        expect(container.querySelectorAll('li').length).toBe(1);
        act(() => each.set('b', null));
        expect(Array.from(container.querySelectorAll('li')).map((el) => el.textContent)).toEqual(['stable', 'null']);
    });
    test('For sorts nullable record rows without filtering valid values', () => {
        type Value = string | number | boolean | null;
        const each = observable<Record<string, Value>>({ a: null, b: false, c: 0, d: '' });
        function Item({ item$ }: { item$: Observable<Value> }) {
            return createElement('li', undefined, String(useSelector(item$)));
        }
        const { container } = render(
            createElement(For as typeof For<Value, {}>, {
                each,
                item: Item,
                sortValues: (a, b) => String(a).localeCompare(String(b)),
            }),
        );
        expect(Array.from(container.querySelectorAll('li')).map((el) => el.textContent)).toEqual([
            '',
            '0',
            'false',
            'null',
        ]);
    });
    test.each(
        [false, true].flatMap((optimized) =>
            [1, '1', 'index:1'].map((id) => ({ optimized, id, label: typeof id + ':' + id })),
        ),
    )('For separates nullable index keys from ID $label, optimized=$optimized', ({ optimized, id }) => {
        type Value = { id: string | number; text: string } | null;
        const each = observable<Value[]>([{ id, text: 'A' }, null]);
        const ids: unknown[] = [];
        const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
        function Item({ item$, id }: { item$: Observable<Value>; id?: string }) {
            ids.push(id);
            const value = useSelector(item$);
            return createElement('li', undefined, value === null ? 'null' : value.text);
        }
        try {
            const { container } = render(createElement(For as typeof For<Value, {}>, { each, item: Item, optimized }));
            const rows = () => Array.from(container.querySelectorAll('li')).map((el) => el.textContent);
            expect(rows()).toEqual(['A', 'null']);
            expect(ids).toEqual([id, 1]);
            act(() => each.unshift({ id: 'new', text: 'B' }));
            expect(each.get()).toEqual([{ id: 'new', text: 'B' }, { id, text: 'A' }, null]);
            expect(rows()).toEqual(['B', 'A', 'null']);
            act(() => each.splice(1, 1));
            expect(rows()).toEqual(['B', 'null']);
            expect(errors.mock.calls.filter(([message]) => String(message).includes('same key'))).toEqual([]);
        } finally {
            errors.mockRestore();
        }
    });
    test.each([false, true])('For preserves IDs after a first-null replacement, optimized=%s', (optimized) => {
        type Value = { id: string; text: string } | null;
        const b = { id: 'b', text: 'B' };
        const each = observable<Value[]>([{ id: 'a', text: 'A' }, b]);
        let instances = 0;
        function Item({ item$, id }: { item$: Observable<Value>; id?: string }) {
            const instance = useState(() => ++instances)[0];
            const value = useSelector(item$);
            return createElement(
                'li',
                { 'data-id': id, 'data-instance': instance },
                value === null ? 'null' : value.text,
            );
        }
        const { container } = render(createElement(For as typeof For<Value, {}>, { each, item: Item, optimized }));
        const instance = container.querySelectorAll('li')[1].getAttribute('data-instance');
        act(() => each.set([null, b]));
        const rows = container.querySelectorAll('li');
        expect(Array.from(rows).map((el) => el.textContent)).toEqual(['null', 'B']);
        expect(rows[1].getAttribute('data-id')).toBe('b');
        expect(rows[1].getAttribute('data-instance')).toBe(instance);
        act(() => each.push({ id: 'c', text: 'C' }));
        const next = container.querySelectorAll('li');
        expect(Array.from(next).map((el) => el.textContent)).toEqual(['null', 'B', 'C']);
        expect(next[1].getAttribute('data-id')).toBe('b');
        expect(next[1].getAttribute('data-instance')).toBe(instance);
    });
    test('For does not call a custom key extractor on null rows', () => {
        const state$ = observable({
            rows: [null, { code: 'kept' }] as ({ code: string } | null)[],
            rows_keyExtractor: (row: { code: string }) => row.code,
        });
        const { container } = render(
            <For each={state$.rows}>{(item$) => <li>{String(item$.get()?.code ?? null)}</li>}</For>,
        );
        expect(Array.from(container.querySelectorAll('li')).map((el) => el.textContent)).toEqual(['null', 'kept']);
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
    test('For with object optimized inserts and deletes keys', () => {
        const items$ = observable<Record<string, TestObject>>({
            m2: { label: 'B', id: 'B' },
            m1: { label: 'A', id: 'A' },
        });
        function Item({ item$ }: { item$: Observable<TestObject> }) {
            const data = useSelector(item$);
            return createElement('li', { id: data.label }, data.label);
        }
        function Test() {
            return createElement(
                'div',
                undefined,
                createElement(For as typeof For<TestObject, {}>, { each: items$, item: Item, optimized: true }),
            );
        }
        const { container } = render(createElement(Test));

        let items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('B');
        expect(items[1].id).toEqual('A');

        act(() => {
            items$.m0.set({ label: 'Z', id: 'Z' });
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(3);
        expect(items[0].id).toEqual('B');
        expect(items[1].id).toEqual('A');
        expect(items[2].id).toEqual('Z');

        act(() => {
            items$.m0.delete();
        });

        items = container.querySelectorAll('li');
        expect(items.length).toEqual(2);
        expect(items[0].id).toEqual('B');
        expect(items[1].id).toEqual('A');
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
    test("Show listeners don't leak", async () => {
        const obs = observable({
            ok: false,
            count: 0,
        });
        function Test() {
            return (
                <div>
                    <Show if={obs.ok}>{() => <span>hi {obs.count.get()}</span>}</Show>
                </div>
            );
        }

        function TestStrict() {
            return (
                <StrictMode>
                    <div>
                        <Show if={obs.ok}>{() => <span>hi {obs.count.get()}</span>}</Show>
                    </div>
                </StrictMode>
            );
        }

        const nodeOk = getNode(obs.ok);
        const nodeCount = getNode(obs.count);
        expect(nodeOk.listeners?.size).toEqual(undefined);
        expect(nodeOk.listenersImmediate?.size).toEqual(undefined);
        expect(nodeCount.listeners?.size).toEqual(undefined);
        expect(nodeCount.listenersImmediate?.size).toEqual(undefined);

        const { container } = render(createElement(Test));
        render(createElement(TestStrict));

        expect(nodeOk.listeners?.size).toEqual(3);
        expect(nodeOk.listenersImmediate?.size).toEqual(undefined);
        expect(nodeCount.listeners?.size).toEqual(undefined);
        expect(nodeCount.listenersImmediate?.size).toEqual(undefined);

        let items = container.querySelectorAll('span');
        expect(items.length).toEqual(0);

        act(() => {
            obs.ok.set(true);
        });

        // 1 for normal and 2 for strict mode
        expect(nodeOk.listeners?.size).toEqual(3);
        expect(nodeOk.listenersImmediate?.size).toEqual(undefined);
        // 2 for strict mode
        expect(nodeCount.listeners?.size).toEqual(2);
        expect(nodeCount.listenersImmediate?.size).toEqual(undefined);

        items = container.querySelectorAll('span');
        expect(items.length).toEqual(1);
        expect(items[0].textContent).toEqual('hi 0');

        act(() => {
            obs.ok.set(false);
        });

        expect(nodeOk.listeners?.size).toEqual(3);
        expect(nodeOk.listenersImmediate?.size).toEqual(undefined);
        expect(nodeCount.listeners?.size).toEqual(0);
        expect(nodeCount.listenersImmediate?.size).toEqual(undefined);

        items = container.querySelectorAll('span');
        expect(items.length).toEqual(0);

        act(() => {
            obs.ok.set(true);
        });

        expect(nodeOk.listeners?.size).toEqual(3);
        expect(nodeOk.listenersImmediate?.size).toEqual(undefined);
        expect(nodeCount.listeners?.size).toEqual(2);
        expect(nodeCount.listenersImmediate?.size).toEqual(undefined);

        items = container.querySelectorAll('span');
        expect(items.length).toEqual(1);
        expect(items[0].textContent).toEqual('hi 0');
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
    test('Show wrap with wrapProps', async () => {
        const obs = observable({
            ok: false,
        });
        let testValue;
        const Wrap = (props: { test: string; children?: any }) => {
            testValue = props.test;
            return props.children;
        };
        function Test() {
            return (
                <Show if={obs.ok} wrap={(props: { children: any }) => <Wrap test="tester" {...props} />}>
                    <span>hi</span>
                </Show>
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
        expect(testValue).toEqual('tester');
    });
    test('useSelector reconfigures when options change', () => {
        const obs = observable(0);
        let runCount = 0;

        const { rerender } = renderHook(
            ({ skipCheck }: { skipCheck: boolean }) =>
                useSelector(
                    () => {
                        runCount++;
                        return obs.get();
                    },
                    { skipCheck },
                ),
            { initialProps: { skipCheck: false } },
        );

        expect(runCount).toBe(1);

        act(() => {
            obs.set(1);
        });

        expect(runCount).toBe(3);

        rerender({ skipCheck: true });
        const countAfterOptionChange = runCount;
        expect(countAfterOptionChange).toBe(4);

        act(() => {
            obs.set(1);
        });

        expect(runCount).toBe(countAfterOptionChange);
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
    test('useObservableReducer accepts lazy initializer functions', () => {
        const reducer = (state: number, action: { type: 'inc' }) => (action.type === 'inc' ? state + 1 : state);
        const lazyInit = () => 5;

        const { result } = renderHook(() => useObservableReducer(reducer as any, lazyInit as unknown as number));

        expect(result.current[0].get()).toBe(5);

        act(() => {
            (result.current[1] as any)({ type: 'inc' });
        });

        expect(result.current[0].get()).toBe(6);
    });
    test('useObservableReducer calls provided initializer function', () => {
        const reducer = (state: { count: number }, action: { type: 'inc' }) =>
            action.type === 'inc' ? { count: state.count + 1 } : state;
        const init = jest.fn((arg: { count: number }) => ({ count: arg.count + 10 }));

        const { result } = renderHook(() => useObservableReducer(reducer, { count: 1 }, init));

        expect(result.current[0].get()).toEqual({ count: 11 });
        expect(init).toHaveBeenCalledTimes(1);
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

        act(() => {
            obs$.set(1);
        });

        expect(num).toEqual(1);
        expect(numObserves).toEqual(1);
    });
    test('useObserve with a deps array', () => {
        let num = 0;
        let numInner = 0;
        const obsOuter$ = observable(0);
        const obsInner$: Observable = observable(0);
        let lastObserved: number | undefined = undefined;
        let lastObservedDep: number | undefined = undefined;
        const Test = observer(function Test() {
            const dep = obsOuter$.get();
            useObserve(
                () => {
                    numInner++;
                    lastObserved = obsInner$.get();
                    lastObservedDep = dep;
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
        expect(lastObservedDep).toEqual(0);

        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(2);
        expect(lastObserved).toEqual(0);
        expect(lastObservedDep).toEqual(1);

        // If inner dep changes it should run again without rendering
        act(() => {
            obsInner$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(3);
        expect(lastObserved).toEqual(1);
        expect(lastObservedDep).toEqual(1);

        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(2);
        });

        expect(num).toEqual(3);
        expect(numInner).toEqual(4);
        expect(lastObserved).toEqual(1);
        expect(lastObservedDep).toEqual(2);
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

        act(() => {
            state$.set((v) => v + 1);
        });
        expect(num).toEqual(2);

        act(() => {
            state$.set((v) => v + 1);
        });
        expect(num).toEqual(3);
    });
    test('useObserve with a deps array', () => {
        let num = 0;
        let numInner = 0;
        const obsOuter$ = observable(0);
        const obsInner$: Observable = observable(0);
        let lastObserved: number | undefined = undefined;
        let lastObservedDep: number | undefined = undefined;
        const Test = observer(function Test() {
            const dep = obsOuter$.get();
            useObserveEffect(
                () => {
                    numInner++;
                    lastObserved = obsInner$.get();
                    lastObservedDep = dep;
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
        expect(lastObservedDep).toEqual(0);

        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(2);
        expect(lastObserved).toEqual(0);
        expect(lastObservedDep).toEqual(1);

        // If inner dep changes it should run again without rendering
        act(() => {
            obsInner$.set(1);
        });

        expect(num).toEqual(2);
        expect(numInner).toEqual(3);
        expect(lastObserved).toEqual(1);
        expect(lastObservedDep).toEqual(1);
        // If deps array changes it should refresh observable
        act(() => {
            obsOuter$.set(2);
        });

        expect(num).toEqual(3);
        expect(numInner).toEqual(4);
        expect(lastObserved).toEqual(1);
        expect(lastObservedDep).toEqual(2);
    });
    test('useObserveEffect defers dependency render updates', async () => {
        const errors = await captureConsoleErrors(async () => {
            const sideEffect$ = observable(0);
            const trigger$ = observable(0);

            let sideEffectValue: number | undefined;
            const CompB = function CompB() {
                sideEffectValue = useSelector(sideEffect$);
                return createElement('div', undefined, sideEffectValue);
            };

            const CompTrigger = function CompTrigger({ value }: { value: number }) {
                useObserveEffect(
                    () => {
                        sideEffect$.set(value);
                    },
                    [value],
                );
                return createElement('div', undefined);
            };

            const App = function App() {
                const value = useSelector(trigger$);
                return createElement('div', undefined, createElement(CompB), createElement(CompTrigger, { value }));
            };

            render(createElement(App));
            expect(sideEffectValue).toEqual(0);

            await act(async () => {
                trigger$.set(1);
            });
            await promiseTimeout(0);

            expect(sideEffectValue).toEqual(1);
        });

        expect(errors).toEqual([]);
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

        await waitFor(() => promiseTimeout(0));

        expect(num).toEqual(2);
        expect(value).toEqual(1 + '_' + originalRand);
    });
    test('useObservable nested cleans up on unmount', async () => {
        const outer$ = observable(true);
        let derivedCallCount = 0;
        let innerDerivedCallCount = 0;

        const Test = () => {
            const derived$ = useObservable(() => {
                derivedCallCount++;
                return `${outer$.get()}`;
            });

            return <TestInner value$={derived$} />;
        };

        const TestInner = ({ value$ }: { value$: Observable<string> }) => {
            const value = use$(
                useObservable(() => {
                    innerDerivedCallCount++;
                    return `inner${value$.get()}`;
                }),
            );

            return <div>{value}</div>;
        };

        function App() {
            return createElement(Test);
        }

        const { unmount } = render(createElement(App));

        // Initial render should call both derived observables
        expect(derivedCallCount).toBe(1);
        expect(innerDerivedCallCount).toBe(1);

        // Unmount the component
        act(() => {
            unmount();
        });

        await waitFor(() => promiseTimeout(0));

        // Record counts after unmount
        const derivedCountAfterUnmount = derivedCallCount;
        const innerDerivedCountAfterUnmount = innerDerivedCallCount;

        // Change outer$ multiple times after unmount
        act(() => {
            outer$.set(false);
        });
        act(() => {
            outer$.set(true);
        });
        act(() => {
            outer$.set(false);
        });

        // The derived observables should not be called after unmount
        expect(innerDerivedCallCount).toBe(innerDerivedCountAfterUnmount);
        expect(derivedCallCount).toBe(derivedCountAfterUnmount);
    });
    test('useObservable with a synced should unsubscribe when unmounted', async () => {
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const Test = observer(function Test() {
            const obs$ = useObservable(
                synced({
                    initial: 0,
                    subscribe: () => {
                        numSubscribes++;
                        return () => {
                            numUnsubscribes++;
                        };
                    },
                }),
            );
            return createElement('div', undefined, obs$.get());
        });

        const { unmount } = render(<Test />);

        act(() => {
            unmount();
        });

        await waitFor(() => promiseTimeout(0));

        expect(numSubscribes).toBe(1);
        expect(numUnsubscribes).toBe(1);
    });

    test('observables with syncObservable should unsubscribe when unmounted', async () => {
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const store$ = observable<any>({});

        syncObservable(store$, {
            subscribe: ({ update }) => {
                numSubscribes++;
                update({ value: { value: 1 }, mode: 'set' });
                return () => {
                    numUnsubscribes++;
                };
            },
        });

        const Test = observer(function Test() {
            return createElement('div', undefined, store$.value.get());
        });

        const { unmount } = render(<Test />);

        act(() => {
            unmount();
        });

        await waitFor(() => promiseTimeout(0));

        expect(numSubscribes).toBe(1);
        expect(numUnsubscribes).toBe(1);
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
describe('$React', () => {
    test('$React works', () => {
        const Test = function Test() {
            return createElement($React.div, { $className: () => 'test' });
        };
        function App() {
            return createElement(Test);
        }
        const { container } = render(createElement(App));

        expect(container.querySelector('div')?.className).toEqual('test');
    });
    test('$React takes observable child', () => {
        const obs$ = observable('test');
        const Test = function Test() {
            return createElement($React.div, null, obs$ as any);
        };
        function App() {
            return createElement(Test);
        }
        const { container } = render(createElement(App));

        expect(container.querySelector('div')?.textContent).toEqual('test');
    });
});

describe('React tracking diagnostics', () => {
    test.each([false, true])('recommends useValue for render reads (observed=%s)', (observed) => {
        const originalEnv = process.env.NODE_ENV;
        const originalGet = internal.observableFns.get('get')!;
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            process.env.NODE_ENV = 'development';
            enableReactTracking({ warnMissingUse: true });
            const value$ = observable({ text: 'hello' });
            const Item = () => <div>{value$.text.get()}</div>;
            const { unmount } = render(createElement(observed ? observer(Item) : Item));
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('`useValue`'));
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('#usevalue'));
            unmount();
        } finally {
            process.env.NODE_ENV = originalEnv;
            configureLegendState({ observableFunctions: { get: originalGet } });
            warn.mockRestore();
        }
    });
});

describe('enableReactTracking React versions (#312)', () => {
    const ReactModule = require('react');
    const legacyKey = '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED';
    const react19Key = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE';
    const legacyInternals = ReactModule[legacyKey];
    const legacyDispatcher = legacyInternals.ReactCurrentDispatcher;

    // Swap the React module's internals for another version's shape while enableReactTracking runs
    function withInternals(shape: '18' | '19' | 'none', fn: (warn: jest.SpyInstance) => void) {
        const originalEnv = process.env.NODE_ENV;
        const originalGet = internal.observableFns.get('get')!;
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        if (shape !== '18') {
            delete ReactModule[legacyKey];
        }
        if (shape === 'none') {
            // Bun snapshots the `import * as React` namespace, so the deleted key can stay visible there
            delete legacyInternals.ReactCurrentDispatcher;
        }
        if (shape === '19') {
            ReactModule[react19Key] = {
                get H() {
                    return legacyDispatcher.current;
                },
            };
        }
        try {
            process.env.NODE_ENV = 'development';
            fn(warn);
        } finally {
            ReactModule[legacyKey] = legacyInternals;
            legacyInternals.ReactCurrentDispatcher = legacyDispatcher;
            delete ReactModule[react19Key];
            process.env.NODE_ENV = originalEnv;
            configureLegendState({ observableFunctions: { get: originalGet } });
            warn.mockRestore();
        }
    }

    test.each(['18', '19'] as const)('warns about get() in render with React %s internals', (shape) => {
        withInternals(shape, (warn) => {
            enableReactTracking({ warnMissingUse: true });
            const value$ = observable('hello');
            value$.get();
            expect(warn).not.toHaveBeenCalled();
            const Item = () => <div>{value$.get()}</div>;
            const { unmount } = render(createElement(Item));
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('`useValue`'));
            unmount();
        });
    });

    test('warns in development when React internals are missing', () => {
        withInternals('none', (warn) => {
            enableReactTracking({ warnMissingUse: true });
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not find the React dispatcher'));
        });
    });
});

describe('production subscription reconnection (#671)', () => {
    test('ordinary mount reads once and removes all listeners on unmount', () => {
        const state$ = observable({ value: 0 });
        let reads = 0;
        function Test() {
            const value = useValue(() => {
                reads++;
                return state$.value.get();
            });
            return <span>{value}</span>;
        }
        const { unmount } = render(<Test />);
        expect(reads).toBe(1);
        unmount();
        expect(getNode(state$).numListenersRecursive).toBe(0);
    });

    test.each(['scalar', 'object', 'conditional', 'skipCheck'])('refreshes %s after effect replay', (kind) => {
        const previousEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const state$ = observable({ useA: true, a: 0, b: 0 });
        function Test() {
            const value = useValue(
                () => {
                    if (kind === 'object') return state$.get();
                    return kind === 'conditional'
                        ? state$.useA.get()
                            ? state$.a.get()
                            : state$.b.get()
                        : state$.a.get();
                },
                kind === 'skipCheck' ? { skipCheck: true } : undefined,
            );
            React.useEffect(() => {
                return () => {
                    if (kind === 'conditional') state$.useA.set(false);
                    else state$.a.set(1);
                };
            }, []);
            return <div data-testid="value">{typeof value === 'object' ? value.a : value}</div>;
        }
        try {
            const { getByTestId, unmount } = render(
                <StrictMode>
                    <Test />
                </StrictMode>,
            );
            expect(getByTestId('value').textContent).toBe(kind === 'conditional' ? '0' : '1');
            act(() => {
                if (kind === 'conditional') state$.b.set(2);
                else state$.a.set(2);
            });
            expect(getByTestId('value').textContent).toBe('2');
            // React 18's discarded StrictMode render already retains listeners on the base revision.
            // The committed subscription must still be removed, without adding to that baseline.
            const legacyListeners = kind === 'conditional' ? 2 : 1;
            expect(getNode(state$).numListenersRecursive).toBe(legacyListeners * 2);
            unmount();
            expect(getNode(state$).numListenersRecursive).toBe(legacyListeners);
        } finally {
            process.env.NODE_ENV = previousEnv;
        }
    });
});

describe('useObserve lifecycle (#205)', () => {
    test('reacts once per change in StrictMode', async () => {
        const obs$ = observable(0);
        const seen: number[] = [];
        function Test() {
            useObserve(
                () => obs$.get(),
                (e) => {
                    seen.push(e.value!);
                },
            );
            return <div />;
        }
        const { unmount } = render(
            <StrictMode>
                <Test />
            </StrictMode>,
        );
        seen.length = 0;
        act(() => obs$.set(1));
        act(() => obs$.set(2));
        expect(seen).toEqual([1, 2]);
        unmount();
        // The dev StrictMode workaround disposes in a microtask
        await promiseTimeout(0);
        expect(getNode(obs$).numListenersRecursive).toBe(0);
    });

    test('run form runs once per change in StrictMode', () => {
        const obs$ = observable(0);
        const seen: number[] = [];
        function Test() {
            useObserve(() => {
                seen.push(obs$.get());
            });
            return <div />;
        }
        render(
            <StrictMode>
                <Test />
            </StrictMode>,
        );
        seen.length = 0;
        act(() => obs$.set(1));
        act(() => obs$.set(2));
        expect(seen).toEqual([1, 2]);
    });

    test('the returned dispose stops an observer recreated on mount', () => {
        const obs$ = observable(0);
        const seen: number[] = [];
        let stop: (() => void) | undefined;
        function Test() {
            stop = useObserve(
                () => obs$.get(),
                (e) => {
                    seen.push(e.value!);
                },
            );
            // A change before the passive mount effect makes mount recreate the observer
            React.useLayoutEffect(() => obs$.set(1), []);
            return <div />;
        }
        const { unmount } = render(<Test />);
        expect(seen).toEqual([0, 1]);
        act(() => stop!());
        act(() => obs$.set(2));
        expect(seen).toEqual([0, 1]);
        expect(getNode(obs$).numListenersRecursive).toBe(0);
        unmount();
    });

    test('reconnects after effect cleanup and replays the missed value', () => {
        const previousEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const obs$ = observable(0);
        const seen: number[] = [];
        function Test() {
            useObserve(
                () => obs$.get(),
                (e) => {
                    seen.push(e.value!);
                },
            );
            React.useEffect(() => () => obs$.set(1), []);
            return <div />;
        }
        try {
            // StrictMode replays effect cleanup and setup like an Activity hide/show
            const { unmount } = render(
                <StrictMode>
                    <Test />
                </StrictMode>,
            );
            expect(seen[seen.length - 1]).toBe(1);
            seen.length = 0;
            act(() => obs$.set(2));
            expect(seen).toEqual([2]);
            unmount();
            expect(getNode(obs$).numListenersRecursive).toBe(0);
        } finally {
            process.env.NODE_ENV = previousEnv;
        }
    });
});
