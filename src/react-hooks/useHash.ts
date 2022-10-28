import { useObservable } from '@legendapp/state/react';
import { useEffect } from 'react';
import type { Observable } from '../observableInterfaces';

export function useHash(): Observable<string> {
    const hasWindow = typeof window !== 'undefined';
    const obs = useObservable(hasWindow ? window.location.hash : '');

    useEffect(() => {
        if (hasWindow) {
            const cb = () => obs.set(window.location.hash);
            window.addEventListener('hashchange', cb);
            return () => {
                window.removeEventListener('hashchange', cb);
            };
        }
    }, []);

    return obs;
}
