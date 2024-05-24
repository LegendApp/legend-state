import { Linked, ObservableParam, linked } from '@legendapp/state';

export function arrayAsSet<T>(arr$: ObservableParam<T[]>): Linked<Set<T>> {
    return linked({
        get: () => new Set<T>(arr$.get()),
        set: ({ value }) => arr$.set(Array.from(value)),
    });
}
