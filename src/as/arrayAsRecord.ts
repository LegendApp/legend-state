import { Linked, ObservableParam, linked } from '@legendapp/state';

export function arrayAsRecord<T, TKey extends keyof T>(
    arr$: ObservableParam<T[]>,
    keyField: TKey = 'id' as TKey,
): Linked<Record<string, T>> {
    return linked({
        get: () => {
            const record = {};
            const value = arr$.get();
            for (let i = 0; i < value.length; i++) {
                const v = value[i];
                const child = v[keyField];
                (record as any)[child[keyField]] = child;
            }
            return record;
        },
        set: ({ value }) => {
            if (value) {
                arr$.set(Object.values(value));
            } else {
                arr$.set(value);
            }
        },
    });
}
