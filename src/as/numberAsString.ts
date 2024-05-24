import { Linked, ObservableParam, linked } from '@legendapp/state';

export function numberAsString(num$: ObservableParam<number>): Linked<string> {
    return linked({
        get: () => num$.get() + '',
        set: ({ value }) => num$?.set(+value),
    });
}
