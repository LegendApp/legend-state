import {
    isFunction,
    ObservableReadable,
    observe,
    ObserveEvent,
    ObserveEventCallback,
    Selector,
} from '@legendapp/state';
import { useRef } from 'react';
import { useUnmountOnce } from 'src/react/useUnmount';
import type { ObserveOptions } from '../observe';

export function useObserve<T>(run: (e: ObserveEvent<T>) => T | void, options?: ObserveOptions): () => void;
export function useObserve<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: ObserveOptions
): () => void;
export function useObserve<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | ObserveOptions,
    options?: ObserveOptions
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

    if (!ref.current) {
        ref.current = {
            dispose: observe(selector, reaction),
        };
    }
    ref.current.selector = selector;
    ref.current.reaction = reaction;

    if (!ref.current) {
        ref.current.dispose = observe<T>(
            ((e: ObserveEventCallback<T>) => {
                const { selector } = ref.current as { selector: (e: ObserveEvent<T>) => T | void };
                return isFunction(selector) ? selector(e) : selector;
            }) as any,
            (e) => ref.current.reaction?.(e),
            options
        );
    }

    useUnmountOnce(() => {
        ref.current?.dispose();
        ref.current = undefined;
    });

    return ref.current.dispose;
}
