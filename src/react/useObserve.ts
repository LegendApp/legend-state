import {
    computeSelector,
    isFunction,
    ObservableReadable,
    observe,
    ObserveEvent,
    ObserveEventCallback,
    Selector,
} from '@legendapp/state';
import { useRef } from 'react';
import type { ObserveOptions } from '../observe';
import { useUnmountOnce } from './useUnmount';

export function useObserve<T>(run: (e: ObserveEvent<T>) => T | void, options?: ObserveOptions): () => void;
export function useObserve<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: ObserveOptions,
): () => void;
export function useObserve<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | ObserveOptions,
    options?: ObserveOptions,
): () => void {
    let reaction: (e: ObserveEventCallback<T>) => any;
    if (isFunction(reactionOrOptions)) {
        reaction = reactionOrOptions;
    } else {
        options = reactionOrOptions;
    }

    const ref = useRef<{
        selector?: Selector<T> | ((e: ObserveEvent<T>) => T | void) | ObservableReadable<T>;
        reaction?: (e: ObserveEventCallback<T>) => any;
        dispose?: () => void;
    }>({});

    ref.current.selector = selector;
    ref.current.reaction = reaction;

    if (!ref.current.dispose) {
        ref.current.dispose = observe<T>(
            ((e: ObserveEventCallback<T>) => computeSelector(ref.current.selector, e)) as any,
            (e) => ref.current.reaction?.(e),
            options,
        );
    }

    useUnmountOnce(() => {
        ref.current?.dispose?.();
        ref.current = undefined;
    });

    return ref.current.dispose;
}
