import type { Observable } from '@legendapp/state';
import { useObservable } from '@legendapp/state/react';
import { useEffect } from 'react';

export function useHover<T extends HTMLElement>(ref?: React.MutableRefObject<T>): Observable<boolean> {
    const obs = useObservable(false);

    useEffect(() => {
        const handleMouseOver = () => obs.set(true);
        const handleMouseOut = (e: MouseEvent) => {
            if (obs.peek() === true) {
                let parent = (e as any).toElement as HTMLElement;
                let foundRef = false;
                while (parent && !foundRef) {
                    if (parent === ref.current) {
                        foundRef = true;
                    }
                    parent = parent.parentElement;
                }

                if (!foundRef) {
                    obs.set(false);
                }
            }
        };

        const node = ref.current;
        if (node) {
            node.addEventListener('mouseover', handleMouseOver);
            node.addEventListener('mouseout', handleMouseOut);

            return () => {
                node.removeEventListener('mouseover', handleMouseOver);
                node.removeEventListener('mouseout', handleMouseOut);
            };
        }
    }, [ref.current]);

    return obs;
}
