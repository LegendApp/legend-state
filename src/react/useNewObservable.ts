import { isFunction } from '../is';
import { useMemo } from 'react';
import { observable } from '../observable';
import { Observable, PersistOptions } from '../observableInterfaces';
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
function useNewObservable<T>(value: object, observe?: boolean, persist?: PersistOptions<T>): [Observable<T>, T] {
    // Create the observable from the default value
    const obs = useMemo(() => {
        const ret = observable(isFunction(value) ? value() : value);
        if (persist) {
            persistObservable(ret, persist);
        }
        return ret;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe !== false) {
        useObservables(obs);
    }

    return [obs, obs.get()];
}

export { useNewObservable };
