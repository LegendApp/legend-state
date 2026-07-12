import { Linked, ObservableParam, linked } from '@legendapp/state';

export function stringAsArray<T>(str$: ObservableParam<string>): Linked<T[]> {
    return linked({
        get: () => {
            try {
                return JSON.parse(str$?.get() || '[]') as T[];
            } catch {
                return [] as T[];
            }
        },
        set: ({ value }) => str$?.set(JSON.stringify(value)),
    });
}
