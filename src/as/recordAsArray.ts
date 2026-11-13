import { Linked, ObservableParam, linked } from '@legendapp/state';

export function recordAsArray<T, TKey extends keyof T>(
    record$: ObservableParam<Record<string | number, T>>,
    keyField: TKey = 'id' as TKey,
): Linked<T[]> {
    return linked({
        get: () => Object.values(record$.get() ?? {}),
        set: ({ value }) => {
            if (value) {
                const record = {};
                for (let i = 0; i < value.length; i++) {
                    const v = value[i];
                    Object.defineProperty(record, v[keyField] as PropertyKey, {
                        value: v,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    });
                }
                record$.set(record);
            } else {
                record$.set(value);
            }
        },
    });
}
