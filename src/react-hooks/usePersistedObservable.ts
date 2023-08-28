import {
    isFunction,
    observable,
    Observable,
    ObservableObject,
    ObservablePersistState,
    PersistOptions,
} from '@legendapp/state';
import { persistObservable } from '@legendapp/state/persist';
import { useMemo } from 'react';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 * @param options Persistence options for the observable
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function usePersistedObservable<T>(
    initialValue: T | (() => T) | (() => Promise<T>),
    options: PersistOptions<T>,
): [Observable<T>, ObservableObject<ObservablePersistState>] {
    // Create the observable from the default value
    return useMemo(() => {
        return persistObservable<T>(initialValue, options);
    }, []);
}
