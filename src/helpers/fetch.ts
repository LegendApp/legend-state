import { Observable, observable } from '@legendapp/state';

export function observableFetch<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text',
): Observable<{
    data?: T;
    error?: any;
    errorStr?: string;
    loading: boolean;
}> {
    const obs: Observable<any> = observable({
        data: undefined,
        error: undefined,
        errorStr: undefined,
        loading: true,
    });

    fetch(input, init)
        .then((response) => response[valueType || 'json']())
        .then((value) => obs.set({ data: value, loading: false }))
        .catch((error) => obs.set({ loading: false, error, errorStr: error?.toString?.() }));

    return obs as any;
}
