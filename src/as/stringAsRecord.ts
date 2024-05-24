import { Linked, ObservableParam, linked } from '@legendapp/state';

export function stringAsRecord<T extends Record<string, any>>(str$: ObservableParam<string>): Linked<T> {
    return linked({
        get: () => {
            return JSON.parse(str$?.get() || '{}') as T;
        },
        set: ({ value }) => str$?.set(JSON.stringify(value)),
    });
}
