import { useEffect } from 'react';
import { useEffectOnce } from './useEffectOnce';

export function useUnmount(fn: () => void) {
    return useEffect(() => fn, []);
}

export function useUnmountOnce(fn: () => void) {
    return useEffectOnce(() => fn);
}
