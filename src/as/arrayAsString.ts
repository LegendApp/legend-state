import { Linked, ObservableParam, linked } from '@legendapp/state';

export function arrayAsString<T extends any[]>(arr$: ObservableParam<T>): Linked<string> {
    return linked({
        get: () => JSON.stringify(arr$?.get()),
        set: ({ value }) => arr$.set(JSON.parse(value || '[]')),
    });
}
