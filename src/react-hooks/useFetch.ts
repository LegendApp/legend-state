import { observableFetch } from '@legendapp/state/helpers/fetch';
import { useMemo } from 'react';

export function useFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text'
) {
    return useMemo(() => observableFetch(input, init, valueType), []);
}
