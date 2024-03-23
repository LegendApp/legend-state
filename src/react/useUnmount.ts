import { useMount, useMountOnce } from './useMount';

export function useUnmount(fn: () => void) {
    return useMount(() => fn);
}

export function useUnmountOnce(fn: () => void) {
    return useMountOnce(() => fn);
}
