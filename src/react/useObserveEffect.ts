import { ObservableReadable, observe, ObserveEvent, ObserveEventCallback, Selector, when } from '@legendapp/state';
import { useRef } from 'react';
import { useUnmount } from './lifecycle';
import { useIsMounted } from './useIsMounted';

export function useObserveEffect<T>(
    selector: ObservableReadable<T>,
    callback: (e: ObserveEventCallback<T>) => T | void
): void;
export function useObserveEffect<T>(selector: (e: ObserveEvent<T>) => T | void): void;
export function useObserveEffect<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => T | void): void;
export function useObserveEffect<T>(selector: Selector<T>, reaction?: (e: ObserveEventCallback<T>) => T | void): void {
    const refDispose = useRef<() => void>();
    const isMounted = useIsMounted();

    refDispose.current?.();

    when(isMounted, () => {
        refDispose.current = observe(selector, reaction);
    });

    useUnmount(refDispose.current);
}
