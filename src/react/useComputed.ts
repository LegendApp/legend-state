import { computed, ObservableComputed } from '@legendapp/state';
import { useRef } from 'react';

export function useComputed<T>(compute: () => T): ObservableComputed<T> {
    const ref = useRef<{ computed?: ObservableComputed<T>; compute?: () => T }>({});
    ref.current.compute = compute;

    let comp = ref.current.computed;

    if (!comp) {
        comp = ref.current.computed = computed(() => ref.current.compute());
    }

    return comp;
}
