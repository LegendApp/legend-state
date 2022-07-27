import { useMemo } from 'react';
import { observableComputed } from '../observableComputed';
import { ObservableComputed, ValidObservableParam } from '../observableInterfaces';
import { useObservables } from './useObservables';

export function useComputed<T>(compute: () => ValidObservableParam<T>, observe?: boolean): [ObservableComputed<T>, T] {
    // Create the observableComputed
    const obs = useMemo(() => observableComputed(compute), []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe !== false) {
        useObservables(() => [obs]);
    }

    return [obs, obs.get()];
}
