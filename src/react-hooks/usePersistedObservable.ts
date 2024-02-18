import { Observable, WithPersistState } from '@legendapp/state';
import { useMemo } from 'react';
import type { WithoutState } from '../persist/persistObservable';

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 * @param options Persistence options for the observable
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function usePersistedObservable<T extends WithoutState>(): Observable<WithPersistState & T> {
    // options: PersistOptions<T>, // initialValue: T | (() => T) | (() => Promise<T>),
    // Create the observable from the default value
    return useMemo(() => {
        // return persistObservable<T>(initialValue, options);
    }, []) as any;
}

// TODO FIX THIS
