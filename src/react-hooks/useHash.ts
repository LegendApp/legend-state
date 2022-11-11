import { useObservable } from '@legendapp/state/react';
import { useEffect } from 'react';
import type { Observable } from '../observableInterfaces';

export function useHash(options?: { setter: 'pushState' | 'replaceState' | 'hash' }): Observable<string> {
    const hasWindow = typeof window !== 'undefined';
    const obs = useObservable(hasWindow ? window.location.hash.slice(1) : '');

    useEffect(() => {
        if (hasWindow) {
            let isSetting = false;
            // Set the page hash when the observable changes
            obs.onChange((value) => {
                if (!isSetting) {
                    const hash = '#' + value;
                    const setter = options?.setter || 'hash';
                    if (setter === 'pushState') {
                        history.pushState(null, null, hash);
                    } else if (setter === 'replaceState') {
                        history.replaceState(null, null, hash);
                    } else {
                        location.hash = hash;
                    }
                }
            });
            // Update the observable whenever the hash changes
            const cb = () => {
                isSetting = true;
                obs.set(window.location.hash.slice(1));
                isSetting = false;
            };
            // Subscribe to window hashChange event
            window.addEventListener('hashchange', cb);
            return () => {
                window.removeEventListener('hashchange', cb);
            };
        }
    }, []);

    return obs;
}
