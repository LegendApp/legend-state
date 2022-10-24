import { computed, ObservableComputed } from '@legendapp/state';
import { useMemo, useRef } from 'react';

export function useComputed<T>(compute: () => T | Promise<T>, deps?: any[]): ObservableComputed<T> {
    const ref = useRef<{ compute?: () => T | Promise<T> }>({});
    ref.current.compute = compute;

    return useMemo(() => computed(() => ref.current.compute()), deps || []);
}
