import { computed, ObservableComputed } from '@legendapp/state';
import { useMemo, useRef } from 'react';

export function useComputed<T>(compute: () => T): ObservableComputed<T> {
    const cb = useRef(compute);
    cb.current = compute;

    return useMemo(() => computed(cb.current), []);
}
