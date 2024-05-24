import { Linked, ObservableParam, linked } from '@legendapp/state';

export function recordAsArray<T, TKey extends keyof T>(
    record$: ObservableParam<Record<string | number, T>>,
    keyField: TKey = 'id' as TKey,
): Linked<T[]> {
    return linked({
        get: () => Object.values(record$),
        set: ({ value }) => {
            if (value) {
                const record = {};
                for (let i = 0; i < value.length; i++) {
                    const v = value[i];
                    const child = v[keyField];
                    (record as any)[child[keyField]] = child;
                }
                record$.set(record);
            } else {
                record$.set(value);
            }
        },
    });
}
