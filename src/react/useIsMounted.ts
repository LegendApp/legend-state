import type { Observable } from '@legendapp/state';
import { useObservable } from './useObservable';
import { useEffectOnce } from './useEffectOnce';

export function useIsMounted(): Observable<boolean> {
    const obs = useObservable(false);

    useEffectOnce(() => {
        obs.set(true);

        return () => obs.set(false);
    });

    return obs;
}
