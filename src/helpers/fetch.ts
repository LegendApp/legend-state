import { observable } from '@legendapp/state';

export function observableFetch<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text'
) {
    const obs = observable<{
        data?: T;
        error?: any;
        errorStr?: string;
        loading: boolean;
    }>({
        data: undefined,
        error: undefined,
        errorStr: undefined,
        loading: true,
    });

    fetch(input, init)
        .then((response) => response[valueType || 'json']())
        .then((value) => obs.set({ data: value, loading: false }))
        .catch((error) => obs.set({ loading: false, error, errorStr: error?.toString?.() }));

    return obs;
}
