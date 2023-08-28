import { isFunction, observable, type Observable } from '@legendapp/state';
import { useMemo } from 'react';
import { useSelector } from './useSelector';

export function useObservableState<T>(initialValue?: T | (() => T) | (() => Promise<T>)): [T, Observable<T>] {
    // Create a memoized observable
    return useMemo(
        () =>
            // Wrap the return array in a Proxy to detect whether the value is accessed
            new Proxy(
                [
                    observable<T>(
                        isFunction(initialValue as () => T) ? (initialValue as () => T)() : (initialValue as T),
                    ),
                    // Second element of the array just needs to exist for the Proxy to access it
                    // but we can't ensure it's updated with the real value, and it doesn't really matter since it's proxied,
                    // so just make it undefined
                    undefined,
                ],
                proxyHandler,
            ),
        [],
    ) as [T, Observable<T>];
}

const proxyHandler: ProxyHandler<any[]> = {
    get(target, prop, receiver) {
        // If the value is accessed at index 1 then `useSelector` to track it for changes
        return prop === '1' ? useSelector(target[0]) : Reflect.get(target, prop, receiver);
    },
};
