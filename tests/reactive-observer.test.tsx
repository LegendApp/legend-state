import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import type { FC, ReactNode } from 'react';
import { observable } from '@legendapp/state';
import type { Selector } from '../src/observableInterfaces';
import { reactGlobals } from '../src/react/react-globals';
import {
    ReactifyProps,
    ShapeWith$,
    observer,
    reactive,
    reactiveComponents,
    reactiveObserver,
} from '../src/react/reactive-observer';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Register happy-dom only if not already registered
if (typeof document === 'undefined') {
    GlobalRegistrator.register();
}

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Normalize<T> = { [K in keyof T]: T[K] };
beforeEach(() => {
    reactGlobals.inObserver = false;
});

describe('reactive', () => {
    test('strips $ prefix and forwards selected values', () => {
        const value$ = observable('selected');
        let propsPassed: any = undefined;

        const Base: FC<any> = (props) => {
            propsPassed = props;
            return createElement('div', undefined, 'rendered');
        };

        const ReactiveComponent = reactive(Base, null);

        const { container } = render(createElement(ReactiveComponent, { $value: value$, normal: 'plain' } as any));

        expect(container.textContent).toBe('rendered');
        expect(propsPassed).toEqual({ value: 'selected', normal: 'plain' });

        act(() => {
            value$.set('updated');
        });

        expect(propsPassed).toEqual({ value: 'updated', normal: 'plain' });
    });

    test('converts children selectors', () => {
        const children$ = observable('child-result');
        let propsPassed: any = undefined;

        const Base: FC<any> = (props) => {
            propsPassed = props;
            return createElement('div', undefined, props.children);
        };

        const ReactiveComponent = reactive(Base, null);
        const { container } = render(createElement(ReactiveComponent, { children: children$ } as any));

        expect(propsPassed.children).toBe('child-result');
        expect(container.textContent).toBe('child-result');

        act(() => {
            children$.set('updated-child');
        });

        expect(propsPassed.children).toBe('updated-child');
        expect(container.textContent).toBe('updated-child');
    });

    test('binders provide two-way handlers', () => {
        const value$ = observable('initial-value');
        const originalHandler = jest.fn();
        const getValue = jest.fn((e: any) => e.detail);
        const customSelector = jest.fn(() => 'from-selector');
        let changeHandler: any = undefined;

        const Base: FC<any> = (props) => {
            changeHandler = props.onChange;
            return createElement('div', undefined, props.value);
        };

        const binder = {
            value: {
                handler: 'onChange',
                getValue,
                selector: (propsOut: Record<string, unknown>, obs: unknown) => {
                    expect(obs).toBe(value$);
                    return customSelector();
                },
                defaultValue: 'default',
            },
        } as const;

        const ReactiveComponent = reactive(Base, null, binder);
        const { container } = render(
            createElement(ReactiveComponent, { $value: value$, normal: true, onChange: originalHandler } as any),
        );

        expect(container.textContent).toBe('from-selector');
        expect(customSelector).toHaveBeenCalledTimes(1);

        const event = { detail: 'new-value' };
        act(() => {
            changeHandler(event);
        });

        expect(getValue).toHaveBeenCalledWith(event);
        expect(value$.get()).toBe('new-value');
        expect(originalHandler).toHaveBeenCalledWith(event);
    });
});

describe('observer', () => {
    test('wraps component render in useSelector and toggles reactive globals', () => {
        let wasInObserver = false;
        const obs$ = observable(0);

        const Base: FC<any> = (props) => {
            wasInObserver = reactGlobals.inObserver;
            obs$.get(); // Access observable to track it
            return createElement('div', undefined, `${props.msg}-${obs$.get()}`);
        };

        const Observed = observer(Base);
        const { container } = render(createElement(Observed, { msg: 'hello' }));

        expect(wasInObserver).toBe(true);
        expect(container.textContent).toBe('hello-0');
        expect(reactGlobals.inObserver).toBe(false);

        act(() => {
            obs$.set(1);
        });

        expect(container.textContent).toBe('hello-1');
    });
});

describe('reactiveObserver', () => {
    test('observes component and converts reactive props', () => {
        const value$ = observable('selected');
        const obs$ = observable(0);
        let wasInObserver = false;
        let propsPassed: any = undefined;

        const Base: FC<any> = (props) => {
            wasInObserver = reactGlobals.inObserver;
            propsPassed = props;
            obs$.get(); // Access observable to track it
            return createElement('div', undefined, `${props.value}-${obs$.get()}`);
        };

        const ReactiveObserved = reactiveObserver(Base, null);
        const { container } = render(createElement(ReactiveObserved, { $value: value$ } as any));

        expect(wasInObserver).toBe(true);
        expect(propsPassed.value).toBe('selected');
        expect(container.textContent).toBe('selected-0');
        expect(reactGlobals.inObserver).toBe(false);

        act(() => {
            value$.set('updated');
        });

        expect(propsPassed.value).toBe('updated');
        expect(container.textContent).toBe('updated-0');

        act(() => {
            obs$.set(1);
        });

        expect(container.textContent).toBe('updated-1');
    });
});

describe('reactiveComponents', () => {
    test('returns memoized reactive components from map', () => {
        const value$ = observable('selected');
        let propsPassed: any = undefined;

        const Base: FC<any> = (props) => {
            propsPassed = props;
            return createElement('div', undefined, props.value);
        };

        const components = reactiveComponents({ Example: Base });

        const FirstAccess = components.Example;
        const SecondAccess = components.Example;
        expect(FirstAccess).toBe(SecondAccess);

        const { container } = render(createElement(FirstAccess, { $value: value$ } as any));

        expect(propsPassed.value).toBe('selected');
        expect(container.textContent).toBe('selected');

        act(() => {
            value$.set('updated');
        });

        expect(propsPassed.value).toBe('updated');
        expect(container.textContent).toBe('updated');
    });
});

describe('reactive typing', () => {
    test('reactive with keys should expose $ prefixed reactive props', () => {
        type TestProps = { text: string; description: string; children?: ReactNode };
        type ReceivedProps = ReactifyProps<TestProps, 'text' | 'children'>;
        type ExpectedProps = Normalize<
            TestProps & {
                $text?: Selector<string>;
                $children?: ReactNode | Selector<ReactNode>;
            }
        >;

        type ReceivedNormalized = Normalize<ReceivedProps>;
        type Keys = keyof ReceivedNormalized;
        type HasDollarChildren = '$children' extends Keys ? true : false;

        type ShouldEqualExpected = Expect<Equal<ReceivedNormalized, ExpectedProps>>;

        void ({} as ShouldEqualExpected);
        void ({} as Expect<Equal<HasDollarChildren, true>>);
    });

    test('reactive with keys should expose $ prefixed reactive props, does not add $children', () => {
        type TestProps = { text: string; description: string; children?: ReactNode };
        type ReceivedProps = ReactifyProps<TestProps, 'text'>;
        type ExpectedProps = Normalize<
            TestProps & {
                $text?: Selector<string>;
            }
        >;

        type ReceivedNormalized = Normalize<ReceivedProps>;
        type Keys = keyof ReceivedNormalized;
        type HasDollarChildren = '$children' extends Keys ? true : false;

        type ShouldEqualExpected = Expect<Equal<ReceivedNormalized, ExpectedProps>>;

        void ({} as ShouldEqualExpected);
        void ({} as Expect<Equal<HasDollarChildren, false>>);
    });

    test('reactive without keys exposes all props with $ prefix', () => {
        type TestProps = { text: string; description: string; children?: ReactNode };
        type ReceivedProps = ShapeWith$<TestProps>;

        // Verify the structure has the expected properties
        type HasTextProp = 'text' extends keyof ReceivedProps ? true : false;
        type HasDollarText = '$text' extends keyof ReceivedProps ? true : false;
        type HasDollarDescription = '$description' extends keyof ReceivedProps ? true : false;
        type HasChildren = 'children' extends keyof ReceivedProps ? true : false;
        type HasDollarChildren = '$children' extends keyof ReceivedProps ? true : false;
        type HasSomethingElse = 'other' extends keyof ReceivedProps ? false : true;

        void ({} as Expect<HasTextProp>);
        void ({} as Expect<HasDollarText>);
        void ({} as Expect<HasDollarDescription>);
        void ({} as Expect<HasChildren>);
        void ({} as Expect<HasDollarChildren>);
        void ({} as Expect<HasSomethingElse>);
    });
});
