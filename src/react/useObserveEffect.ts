import {
    isFunction,
    ObservableReadable,
    observe,
    ObserveEvent,
    ObserveEventCallback,
    Selector,
} from '@legendapp/state';
import { useRef } from 'react';
import { useEffectOnce } from './useEffectOnce';

export function useObserveEffect<T>(
    selector: ObservableReadable<T>,
    callback: (e: ObserveEventCallback<T>) => any
): void;
export function useObserveEffect<T>(selector: (e: ObserveEvent<T>) => T | void): void;
export function useObserveEffect<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => any): void;
export function useObserveEffect<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => any): void {
    const ref = useRef<{
        selector: Selector<T> | ((e: ObserveEvent<T>) => T | void) | ObservableReadable<T>;
        reaction?: (e: ObserveEventCallback<T>) => any;
    }>({ selector });
    ref.current = { selector, reaction };

    useEffectOnce(() =>
        observe<T>(
            ((e: ObserveEventCallback<T>) => {
                const { selector } = ref.current as { selector: (e: ObserveEvent<T>) => T | void };
                return isFunction(selector) ? selector(e) : selector;
            }) as any,
            (e) => ref.current.reaction?.(e)
        )
    );
}
