import { isPromise } from '@legendapp/state';
import { useEffectOnce } from './useEffectOnce';

export function useMount(fn: () => (void | (() => void)) | Promise<void>) {
    return useEffectOnce(() => {
        const ret = fn();
        // Allow the function to be async but if so ignore its return value
        if (!isPromise(ret)) {
            return ret;
        }
    }, []);
}

// TODOV4 Deprecate
export const useMountOnce = useMount;
