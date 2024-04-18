import { Observable, ObservableParam, LegacyPersistOptions, observable } from '@legendapp/state';
import { persistObservable } from '@legendapp/state/persist';
import { useMemo } from 'react';

// TODO: Deprecate this

/**
 * A React hook that creates a new observable and can optionally listen or persist its state.
 *
 * @param initialValue The initial value of the observable or a function that returns the initial value
 * @param options Persistence options for the observable
 *
 * @see https://www.legendapp.com/dev/state/react/#useObservable
 */
export function usePersistedObservable<T>(params: {
    options: LegacyPersistOptions<T>;
    initialValue?: T | (() => T) | (() => Promise<T>);
}): Observable<T> {
    // Create the observable from the default value
    return useMemo(() => {
        const obs$ = observable<T>(params.initialValue as any);
        persistObservable<T>(obs$ as ObservableParam<T>, params.options);
    }, []) as any;
}
