import { computed, ObservableComputed } from '@legendapp/state';
import { useMemo } from 'react';

export function useComputed<T>(compute: () => T): ObservableComputed<T> {
    return useMemo(() => computed(compute), []);
}
