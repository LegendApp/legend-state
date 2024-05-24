import { Linked, ObservableParam, linked } from '@legendapp/state';

export function setAsArray<T>(set$: ObservableParam<Set<T>>): Linked<T[]> {
    return linked({
        get: () => Array.from<T>(set$?.get()),
        set: ({ value }) => set$.set(new Set<T>(value)),
    });
}
