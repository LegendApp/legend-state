import { useComputed } from './useComputed';

export function useObserve<T>(selector: () => T) {
    return useComputed(selector, false);
}
