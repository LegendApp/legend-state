import { observable } from '@legendapp/state';

export function observableFetch<T extends unknown>(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text'
) {
    const obs = observable<{
        data?: T;
        error?: any;
        loading: boolean;
    }>({
        data: undefined,
        error: undefined,
        loading: true,
    });

    fetch(input, init)
        .then((response) => response[valueType || 'json']())
        .then((value) => obs.set({ data: value as T, loading: false }))
        .catch((reason) => obs.set({ error: reason, loading: false }));

    return obs;
}
