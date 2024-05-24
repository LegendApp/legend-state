import { Linked, ObservableParam, linked } from '@legendapp/state';

export function recordAsString(record$: ObservableParam<Record<any, any>>): Linked<string> {
    return linked({
        get: () => JSON.stringify(record$.get()),
        set: ({ value }) => record$?.set(JSON.parse(value || '{}')),
    });
}
