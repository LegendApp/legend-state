import { useMemo } from 'react';
import { symbolGet } from '../globals';
import { isFunction } from '../is';
import { observable } from '../observable';
import { ObservableOrPrimitive, PersistOptions } from '../observableInterfaces';
import { persistObservable } from '../persistObservable';
import { useObservables } from './useObservables';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param value The initial value of the observable or a function that returns the initial value
 * @param observe (optional) Listen to the observable for changes
 * @param persist (optional) PersistOptions for peristing the observable to state
 *
 * @see https://www.legendapp.com/dev/state/react/#usenewobservable
 */
export function useNewObservable<T>(
    value: T | (() => T),
    observe?: boolean,
    persist?: PersistOptions<T>
): [ObservableOrPrimitive<T>, T] {
    // Create the observable from the default value
    const obs = useMemo(() => {
        const ret = observable<any>(isFunction(value) ? value() : value);
        if (persist) {
            persistObservable(ret, persist);
        }
        return ret;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe !== false) {
        useObservables(() => [obs]);
    }

    return [obs as any, obs[symbolGet as any]];
}
