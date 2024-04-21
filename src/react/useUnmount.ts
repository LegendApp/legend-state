import { useMount } from './useMount';

export function useUnmount(fn: () => void) {
    return useMount(() => fn);
}

// TODOV4 Deprecate
export const useUnmountOnce = useUnmount;
