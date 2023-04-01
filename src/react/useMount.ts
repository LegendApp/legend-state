import type { EffectCallback } from 'react';
import { useEffect } from 'react';
import { useEffectOnce } from './useEffectOnce';

export function useMount(fn: EffectCallback) {
    return useEffect(fn, []);
}

export const useMountOnce = useEffectOnce;
