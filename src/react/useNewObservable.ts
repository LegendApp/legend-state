import { isFunction } from '@legendapp/tools';
import { useMemo } from 'react';
import { persistObservable } from '../persistObservable';
import { observable } from '../observable';
import { Observable, ValidObservableParam, PersistOptions } from '../observableInterfaces';
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
function useNewObservable<T>(
    value: (() => ValidObservableParam<T>) | ValidObservableParam<T>,
    observe?: boolean,
    persist?: PersistOptions<T>
): [Observable<T>, T] {
    // Create the observable from the default value
    const obs = useMemo(() => {
        const ret = observable(isFunction(value) ? value() : value);
        if (persist) {
            persistObservable(ret, persist);
        }
        return ret;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe !== false) {
        useObservables(() => [obs]);
    }

    return [obs, obs.get()];
}

export { useNewObservable };
