import { useEffect } from 'react';

export function useUnmount(fn: () => void) {
    return useEffect(() => fn, []);
}
