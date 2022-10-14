import {
    computeSelector,
    observe,
    Selector,
    ObservableReadable,
    symbolIsEvent,
    ObserveEvent,
    ObserveEventCallback,
} from '@legendapp/state';
import { useEffect, useRef } from 'react';

export function useObserve<T>(
    selector: ObservableReadable<T>,
    callback: (e: ObserveEventCallback<T>) => T | void
): void;
export function useObserve<T>(selector: (e: ObserveEvent<T>) => T | void): void;
export function useObserve<T>(selector: Selector<T>, callback?: (e: ObserveEventCallback<T>) => T | void): void {
    const ref = useRef<{ selector: Selector<T>; callback: (e: ObserveEventCallback<T>) => T | void }>();
    ref.current = { selector, callback };

    useEffect(() => {
        return observe<T>((e: ObserveEventCallback<T>) => {
            const { selector, callback } = ref.current;
            delete e.value;
            computeSelector(selector, e);
            // Don't run callback the first time if it's an event
            if (callback && (e.num > 0 || !selector[symbolIsEvent])) {
                e.value = e.previous;
                callback(e);
            }
        });
    }, []);
}
