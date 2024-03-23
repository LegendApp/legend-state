import type { Observable } from '@legendapp/state';
import { useMountOnce } from './useMount';
import { useObservable } from './useObservable';

export function useIsMounted(): Observable<boolean> {
    const obs = useObservable(false);

    const { set } = obs;
    useMountOnce(() => {
        set(true);

        return () => set(false);
    });

    return obs;
}
