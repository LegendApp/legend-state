import { Linked, ObservableParam, linked } from '@legendapp/state';

export function setAsString(set$: ObservableParam<Set<any>>): Linked<string> {
    return linked({
        get: () => JSON.stringify(Array.from(set$?.get())),
        set: ({ value }) => set$.set(new Set<string>(JSON.parse(value || '[]'))),
    });
}
