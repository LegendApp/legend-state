import { computeSelector, observe, Selector, ObservableReadable, symbolIsEvent, ObserveEvent } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export function useObserve<T>(selector: ObservableReadable<T>, callback: (e: ObserveEvent<T>) => T | void): void;
export function useObserve<T>(selector: (e: ObserveEvent<T>) => T | void): void;
export function useObserve<T>(selector: Selector<T>, callback?: (e: ObserveEvent<T>) => T | void): void {
    const ref = useRef<{ selector: Selector<T>; callback: (e: ObserveEvent<T>) => T | void }>();
    ref.current = { selector, callback };

    useEffect(() => {
        return observe<T>((e) => {
            const { selector, callback } = ref.current;
            computeSelector(selector, e);
            // Don't run callback the first time if it's an event
            if (callback && (e.num > 0 || !selector[symbolIsEvent])) {
                callback(e);
            }
        });
    }, []);
}
