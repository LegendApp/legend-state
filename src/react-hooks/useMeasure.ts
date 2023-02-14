import type { ObservableObject } from '@legendapp/state';
import { useObservable } from '@legendapp/state/react';
import { RefObject, useLayoutEffect } from 'react';

function getSize(el: HTMLElement): { width: number; height: number } | undefined {
    return el
        ? {
              width: el.offsetWidth,
              height: el.offsetHeight,
          }
        : undefined;
}

export function useMeasure(ref: RefObject<HTMLElement>): ObservableObject<{
    width: number | undefined;
    height: number | undefined;
}> {
    const obs = useObservable<{ width: number | undefined; height: number | undefined }>({
        width: undefined,
        height: undefined,
    });

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
                (resizeObserver as any) = undefined;
            };
        }
    }, [ref.current]);

    return obs;
}
