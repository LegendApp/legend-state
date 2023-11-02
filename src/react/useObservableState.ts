import { isFunction, observable, type Observable } from '@legendapp/state';
import { useMemo } from 'react';
import { useSelector } from './useSelector';

export function useObservableState<T>(initialValue?: T | (() => T) | (() => Promise<T>)): [Observable<T>, T] {
    // Create a memoized observable
    return useMemo(
        () =>
            // Wrap the return array in a Proxy to detect whether the value is accessed
            new Proxy(
                [
                    observable<T>((isFunction(initialValue) ? initialValue() : initialValue) as any),
                    // Second element of the array just needs to exist for the Proxy to access it
                    // but we can't ensure it's updated with the real value, and it doesn't really matter since it's proxied,
                    // so just make it undefined. Alternatively the Proxy handler could manually return 2 for the "length" prop
                    // but this seems easier and less code.
                    undefined,
                ],
                proxyHandler,
            ),
        [],
    ) as [Observable<T>, T];
}

const proxyHandler: ProxyHandler<any[]> = {
    get(target, prop, receiver) {
        // If the value is accessed at index 1 then `useSelector` to track it for changes
        return prop === '1' ? useSelector(target[0]) : Reflect.get(target, prop, receiver);
    },
};
