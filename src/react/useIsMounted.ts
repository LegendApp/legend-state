import type { Observable } from '@legendapp/state';
import { useObservable } from '@legendapp/state/react';
import { useEffect } from 'react';

export function useIsMounted(): Observable<boolean> {
    const obs = useObservable(false);

    useEffect(() => {
        obs.set(true);

        return () => {
            obs.set(false);
        };
    }, []);

    return obs;
}
