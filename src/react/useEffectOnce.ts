import { isFunction } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export const useEffectOnce = (effect: () => void | (() => void)) => {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        const refDispose = useRef<void | (() => void)>();

        useEffect(() => {
            if (refDispose.current === undefined) {
                const ret = effect() ?? null;
                refDispose.current = ret;
                if (ret && isFunction(ret)) {
                    return () => {
                        // Queue the dispose function in a microtask because that will run it after
                        // StrictMode runs the effect for the second time. The assumption here is that
                        // it's safe to wait until the microtask queue runs at the end of the frame to
                        // dispose the effect. It's possible that this is not safe in 100% of cases, but
                        // I'm not sure what the dangerous cases would be. And this is only a problem in
                        // DEV mode so it's not a big deal if it's not 100% safe, unless it causes significant
                        // differences between dev/prod somehow.
                        queueMicrotask(() => {
                            (refDispose.current as () => void)();
                            refDispose.current = undefined;
                        });
                    };
                }
            }
        }, []);
    } else {
        useEffect(effect, []);
    }
};
