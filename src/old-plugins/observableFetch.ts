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
    const value$: Observable<any> = observable({
        data: undefined,
        error: undefined,
        errorStr: undefined,
        loading: true,
    });

    fetch(input, init)
        .then((response) => response[valueType || 'json']())
        .then((value) => value$.set({ data: value, loading: false }))
        .catch((error) => value$.set({ loading: false, error, errorStr: error?.toString?.() }));

    return value$ as any;
}
