import { Linked, ObservableParam, linked } from '@legendapp/state';

export function stringAsSet<T>(str$: ObservableParam<string>): Linked<Set<T>> {
    return linked({
        get: () => new Set<T>(JSON.parse(str$?.get() || '[]')),
        set: ({ value }) => str$?.set(JSON.stringify(Array.from(value))),
    });
}
