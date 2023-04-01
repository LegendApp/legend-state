import { ObservableReadable, observe, ObserveEvent, ObserveEventCallback, Selector } from '@legendapp/state';
import { useRef } from 'react';
import { useUnmountOnce } from './useUnmount';

export function useObserve<T>(selector: ObservableReadable<T>, callback: (e: ObserveEventCallback<T>) => any): void;
export function useObserve<T>(selector: (e: ObserveEvent<T>) => any): () => void;
export function useObserve<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => any): () => void;
export function useObserve<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => any): () => void {
    const refDispose = useRef<() => void>();

    refDispose.current?.();
    refDispose.current = observe(selector, reaction);

    useUnmountOnce(() => {
        refDispose.current?.();
        refDispose.current = undefined;
    });

    return refDispose.current;
}
