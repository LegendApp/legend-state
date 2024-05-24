import { Linked, ObservableParam, isNumber, linked } from '@legendapp/state';

export function stringAsNumber(num$: ObservableParam<string>): Linked<number> {
    return linked({
        get: () => {
            const num = +num$.get();
            return isNumber(num) ? +num : 0;
        },
        set: ({ value }) => num$?.set(value + ''),
    });
}
