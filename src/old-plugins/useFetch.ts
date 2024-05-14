import { Observable } from '@legendapp/state';
// @ts-expect-error asdf
import { observableFetch } from '@legendapp/state/helpers/fetch';
import { useMemo } from 'react';

export function useFetch<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text',
): Observable<{
    data?: T;
    error?: any;
    errorStr?: string;
    loading: boolean;
}> {
    return useMemo(() => observableFetch<T>(input, init, valueType), []);
}
