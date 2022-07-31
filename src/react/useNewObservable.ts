import { isFunction } from '@legendapp/tools';
import { useMemo } from 'react';
import { observable3 } from 'src/observable3';
import { Observable2, PersistOptions } from '../observableInterfaces';
import { persistObservable } from '../persistObservable';
import { useObservables3 } from './useObservables3';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param value The initial value of the observable or a function that returns the initial value
 * @param observe (optional) Listen to the observable for changes
 * @param persist (optional) PersistOptions for peristing the observable to state
 *
 * @see https://www.legendapp.com/dev/state/react/#usenewobservable
 */
function useNewObservable<T>(value: object, observe?: boolean, persist?: PersistOptions<T>): [Observable2<T>, T] {
    // Create the observable from the default value
    const obs = useMemo(() => {
        const ret = observable3(isFunction(value) ? value() : value);
        if (persist) {
            persistObservable(ret, persist);
        }
        return ret;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe !== false) {
        useObservables3(obs);
    }

    return [obs, obs.get()];
}

export { useNewObservable };
