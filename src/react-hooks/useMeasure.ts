import { useObservable } from '@legendapp/state/react';
import { RefObject, useLayoutEffect } from 'react';
import type { ObservableObject } from '../observableInterfaces';

function getSize(el: HTMLElement): { width: number; height: number } {
    return {
        width: el?.offsetWidth,
        height: el?.offsetHeight,
    };
}

export function useMeasure(ref: RefObject<HTMLElement>): ObservableObject<{
    width: number;
    height: number;
}> {
    const obs = useObservable({ width: undefined, height: undefined });

    useLayoutEffect(() => {
        const el = ref.current;
        if (el) {
            const handleResize = () => {
                if (ref.current) {
                    const oldSize = obs.peek();
                    const newSize = getSize(ref.current);
                    if (newSize && (newSize.width !== oldSize.width || newSize.height !== oldSize.height)) {
                        obs.set(newSize);
                    }
                }
            };
            handleResize();

            let resizeObserver = new ResizeObserver(handleResize);
            resizeObserver.observe(el);

            return () => {
                resizeObserver.disconnect();
                resizeObserver = undefined;
            };
        }
    }, [ref.current]);

    return obs;
}
