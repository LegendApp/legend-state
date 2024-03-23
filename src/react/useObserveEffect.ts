import {
    isFunction,
    ObservableReadable,
    observe,
    ObserveEvent,
    ObserveEventCallback,
    Selector,
} from '@legendapp/state';
import { useRef } from 'react';
import type { ObserveOptions } from '../observe';
import { useMountOnce } from './useMount';

export function useObserveEffect<T>(run: (e: ObserveEvent<T>) => T | void, options?: ObserveOptions): void;
export function useObserveEffect<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: ObserveOptions,
): void;
export function useObserveEffect<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | ObserveOptions,
    options?: ObserveOptions,
): void {
    let reaction: ((e: ObserveEventCallback<T>) => any) | undefined;
    if (isFunction(reactionOrOptions)) {
        reaction = reactionOrOptions;
    } else {
        options = reactionOrOptions;
    }

    const ref = useRef<{
        selector: Selector<T> | ((e: ObserveEvent<T>) => T | void) | ObservableReadable<T>;
        reaction?: (e: ObserveEventCallback<T>) => any;
    }>({ selector });
    ref.current = { selector, reaction };

    useMountOnce(() =>
        observe<T>(
            ((e: ObserveEventCallback<T>) => {
                const { selector } = ref.current as { selector: (e: ObserveEvent<T>) => T | void };
                return isFunction(selector) ? selector(e) : selector;
            }) as any,
            (e) => ref.current.reaction?.(e),
            options,
        ),
    );
}
