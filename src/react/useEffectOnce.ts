import { isFunction } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export const useEffectOnce = (effect: () => void | (() => void), deps: any[]) => {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        const refDispose = useRef<{ dispose?: void | (() => void); num: number }>({ num: 0 });

        useEffect(() => {
            // This is a hack to work around StrictMode running effects twice.
            // On the first run it returns a cleanup function that queues the dispose function
            // in a microtask. This way it will run at the end of the frame after StrictMode's second
            // run of the effect. If it's run a second time then the microtasked dispose will do nothing,
            // but the effect will return the dispose again so that when it actually unmounts it will dispose.
            // If not in StrictMode, then the dispose function will run in the microtask.
            // It's possible that this is not safe in 100% of cases, but I'm not sure what the
            // dangerous cases would be. The side effect is that the listener is still active
            // until the end of the frame, but that's probably not a problem.
            const { current } = refDispose;
            current.num++;
            const dispose = () => {
                if (current.dispose && current.num < 2) {
                    (current.dispose as () => void)();
                    current.dispose = undefined;
                }
                current.num--;
            };
            if (current.dispose === undefined) {
                const ret = effect() ?? null;
                // If ret is a function, then it's a dispose function.
                if (ret && isFunction(ret)) {
                    current.dispose = ret;
                    return () => queueMicrotask(dispose);
                }
            } else {
                return dispose;
            }
        }, deps);
    } else {
        useEffect(effect, deps);
    }
};
