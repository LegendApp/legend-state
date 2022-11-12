import type { EffectCallback } from 'react';
import { useEffect } from 'react';

export function useMount(fn: EffectCallback) {
    return useEffect(fn, []);
}

export function useUnmount(fn: () => void) {
    return useEffect(() => fn, []);
}
