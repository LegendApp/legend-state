import { computeSelector, isFunction, observe, Selector } from '@legendapp/state';
import { useRef } from 'react';
import type { ObserveEvent, ObserveEventCallback, ObserveOptions } from '../observe';
import { useUnmountOnce } from './useUnmount';

export type ObservableListenerDispose = () => void;

export function useObserve<T>(
    run: (e: ObserveEvent<T>) => T | void,
    options?: ObserveOptions,
): ObservableListenerDispose;
export function useObserve<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: ObserveOptions,
): ObservableListenerDispose;
export function useObserve<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | ObserveOptions,
    options?: ObserveOptions,
): () => void {
    let reaction: ((e: ObserveEventCallback<T>) => any) | undefined;
    if (isFunction(reactionOrOptions)) {
        reaction = reactionOrOptions;
    } else {
        options = reactionOrOptions;
    }

    const ref = useRef<{
        selector?: Selector<T> | ((e: ObserveEvent<T>) => T | void);
        reaction?: (e: ObserveEventCallback<T>) => any;
        dispose?: () => void;
    }>({});

    ref.current.selector = selector;
    ref.current.reaction = reaction;

    if (!ref.current.dispose) {
        ref.current.dispose = observe<T>(
            (e: ObserveEventCallback<T>) => computeSelector(ref.current.selector!, e),
            (e) => ref.current.reaction?.(e),
            options,
        );
    }

    useUnmountOnce(() => {
        ref.current?.dispose?.();
        // @ts-expect-error This is fine to clear the ref to make sure it doesn't run anymore
        ref.current = undefined;
    });

    return ref.current.dispose;
}
