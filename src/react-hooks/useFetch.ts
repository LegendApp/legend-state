import { observableFetch } from '@legendapp/state/helpers/fetch';
import { useMemo } from 'react';

export function useFetch<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text',
) {
    return useMemo(() => observableFetch<T>(input, init, valueType), []);
}
