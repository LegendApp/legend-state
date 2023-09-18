import type { Observable } from '@legendapp/state';
import { useObservable } from './useObservable';
import { useEffectOnce } from './useEffectOnce';

export function useIsMounted(): Observable<boolean> {
    const obs = useObservable(false);

    const { set } = obs;
    useEffectOnce(() => {
        set(true);

        return () => set(false);
    });

    return obs;
}
