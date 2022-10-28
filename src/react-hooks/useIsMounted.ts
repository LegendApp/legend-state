import { useObservable } from '@legendapp/state/react';
import { useEffect } from 'react';
import type { Observable } from '../observableInterfaces';

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
