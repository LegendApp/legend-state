import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { FC } from 'react';
import { reactGlobals } from '../src/react/react-globals';
import { observer, reactive, reactiveComponents, reactiveObserver } from '../src/react/reactive-observer';

jest.mock('react', () => {
    const actualReact = jest.requireActual('react') as typeof import('react');
    return {
        ...actualReact,
        useCallback: <T extends (...args: any[]) => any>(fn: T) => fn,
    };
});

const useSelectorMock = jest.fn();

jest.mock('../src/react/useSelector', () => ({
    useSelector: (...args: unknown[]) => useSelectorMock(...args),
}));

jest.mock('@legendapp/state', () => ({
    isFunction: (value: unknown): value is (...args: any[]) => any => typeof value === 'function',
    isObservable: (value: any) => Boolean(value && value.__isObservable),
}));

beforeEach(() => {
    useSelectorMock.mockReset();
    reactGlobals.inObserver = false;
});

describe('reactive', () => {
    test('strips $ prefix and forwards selected values', () => {
        const base = jest.fn(() => 'rendered') as unknown as FC<any>;
        const selectorToken = { token: 'value' };
        useSelectorMock.mockImplementation((arg) => {
            expect(arg).toBe(selectorToken);
            return 'selected';
        });

        const ReactiveComponent = reactive(base, null);
        const result = ReactiveComponent({ $value: selectorToken, normal: 'plain' } as any);

        expect(result).toBe('rendered');
        expect(base).toHaveBeenCalledTimes(1);
        const propsPassed = ((base as unknown as jest.Mock).mock.calls[0][0] ?? {}) as Record<string, unknown>;
        expect(propsPassed).toEqual({ value: 'selected', normal: 'plain' });
    });

    test('converts children selectors', () => {
        const base = jest.fn(() => null) as unknown as FC<any>;
        const childSelector = jest.fn();
        useSelectorMock.mockImplementation((arg) => {
            expect(arg).toBe(childSelector);
            return 'child-result';
        });

        const ReactiveComponent = reactive(base, null);
        ReactiveComponent({ children: childSelector } as any);

        const propsPassed = ((base as unknown as jest.Mock).mock.calls[0][0] ?? {}) as Record<string, unknown>;
        expect(propsPassed.children).toBe('child-result');
        expect(childSelector).not.toHaveBeenCalled();
    });

    test('binders provide two-way handlers', () => {
        const base = jest.fn(() => null) as unknown as FC<any>;
        const observableMock = { __isObservable: true, set: jest.fn() };
        const originalHandler = jest.fn();
        const getValue = jest.fn((e: any) => e.detail);
        const selector = jest.fn(() => 'from-selector');

        const binder = {
            value: {
                handler: 'onChange',
                getValue,
                selector: (propsOut: Record<string, unknown>, obs: unknown) => {
                    expect(obs).toBe(observableMock);
                    return selector();
                },
                defaultValue: 'default',
            },
        } as const;

        const ReactiveComponent = reactive(base, null, binder);
        ReactiveComponent({ $value: observableMock, normal: true, onChange: originalHandler } as any);

        const propsPassed = ((base as unknown as jest.Mock).mock.calls[0][0] ?? {}) as Record<string, any>;
        expect(propsPassed.value).toBe('from-selector');

        const event = { detail: 'new-value' };
        propsPassed.onChange(event);
        expect(getValue).toHaveBeenCalledWith(event);
        expect(observableMock.set).toHaveBeenCalledWith('new-value');
        expect(originalHandler).toHaveBeenCalledWith(event);
        expect(useSelectorMock).not.toHaveBeenCalled();
        expect(selector).toHaveBeenCalledTimes(1);
    });
});

describe('observer', () => {
    test('wraps component render in useSelector and toggles reactive globals', () => {
        useSelectorMock.mockImplementation((fn: any, options: unknown) => {
            expect(typeof fn).toBe('function');
            expect(options).toEqual({ skipCheck: true });
            return fn();
        });

        const base = jest.fn(() => {
            expect(reactGlobals.inObserver).toBe(true);
            return 'observed-result';
        }) as unknown as FC<any>;

        const Observed = observer(base);
        const result = (Observed as any).type({ msg: 'hello' } as any);

        expect(result).toBe('observed-result');
        expect(base).toHaveBeenCalledWith({ msg: 'hello' });
        expect(reactGlobals.inObserver).toBe(false);
    });
});

describe('reactiveObserver', () => {
    test('observes component and converts reactive props', () => {
        const selectorToken = { token: 'value' };
        useSelectorMock
            .mockImplementationOnce((arg) => {
                expect(arg).toBe(selectorToken);
                return 'selected';
            })
            .mockImplementationOnce((fn: any) => fn());

        const base = jest.fn(() => {
            expect(reactGlobals.inObserver).toBe(true);
            return 'output';
        }) as unknown as FC<any>;

        const ReactiveObserved = reactiveObserver(base, null);
        const result = (ReactiveObserved as any).type({ $value: selectorToken } as any);

        expect(result).toBe('output');
        const propsPassed = ((base as unknown as jest.Mock).mock.calls[0][0] ?? {}) as Record<string, unknown>;
        expect(propsPassed.value).toBe('selected');
        expect(reactGlobals.inObserver).toBe(false);
        expect(useSelectorMock).toHaveBeenCalledTimes(2);
    });
});

describe('reactiveComponents', () => {
    test('returns memoized reactive components from map', () => {
        const selectorToken = { token: 'value' };
        useSelectorMock.mockImplementation(() => 'selected');

        const base = jest.fn(() => null) as unknown as FC<any>;
        const components = reactiveComponents({ Example: base });

        const FirstAccess = components.Example;
        const SecondAccess = components.Example;
        expect(FirstAccess).toBe(SecondAccess);

        FirstAccess({ $value: selectorToken } as any);

        expect(base).toHaveBeenCalledWith({ value: 'selected' });
        expect(useSelectorMock).toHaveBeenCalledWith(selectorToken);
    });
});
