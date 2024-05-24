import { Linked, ObservableParam, linked } from '@legendapp/state';

export function stringAsArray<T>(str$: ObservableParam<string>): Linked<T[]> {
    return linked({
        get: () => JSON.parse(str$?.get() || '[]') as T[],
        set: ({ value }) => str$?.set(JSON.stringify(value)),
    });
}
