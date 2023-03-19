import { ObservableReadable, observe, ObserveEvent, ObserveEventCallback, Selector } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export function useObserve<T>(
    selector: ObservableReadable<T>,
    callback: (e: ObserveEventCallback<T>) => T | void
): void;
export function useObserve<T>(selector: (e: ObserveEvent<T>) => T | void): () => void;
export function useObserve<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => T | void): () => void;
export function useObserve<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => T | void): () => void {
    const refDispose = useRef<() => void>();

    refDispose.current?.();
    refDispose.current = observe(selector, reaction);

    useEffect(() => {
        // React 18 StrictMode workaround to re-observe when useEffect is called twice
        if (!refDispose.current) {
            refDispose.current = observe(selector, reaction);
        }
        return () => {
            refDispose.current?.();
            refDispose.current = undefined;
        };
    });

    return refDispose.current;
}
