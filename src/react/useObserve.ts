import { ObservableReadable, observe, ObserveEvent, ObserveEventCallback, Selector } from '@legendapp/state';
import { useRef } from 'react';
import { useUnmount } from './lifecycle';

export function useObserve<T>(
    selector: ObservableReadable<T>,
    callback: (e: ObserveEventCallback<T>) => T | void
): void;
export function useObserve<T>(selector: (e: ObserveEvent<T>) => T | void): void;
export function useObserve<T>(selector: Selector<T>, callback?: (e: ObserveEventCallback<T>) => T | void): void {
    const refDispose = useRef<() => void>();

    refDispose.current?.();

    refDispose.current = observe(selector, callback);

    useUnmount(refDispose.current);
}
