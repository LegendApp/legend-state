import {
    observe,
    setupTracking,
    symbolUndef,
    tracking,
    isFunction,
    isObservable,
    ObservablePrimitive,
} from '@legendapp/state';
import { useEffect } from 'react';
import { useForceRender } from './useForceRender';

export function useSelector<T>(selector: ObservablePrimitive<T> | (() => T)): T {
    let inRun = true;

    let ret: T = symbolUndef as unknown as T;
    let cachedNodes;

    const fr = useForceRender();

    const update = function () {
        // If running, call selector and re-render if changed
        let cur = selector as any;
        if (isFunction(cur)) {
            cur = cur();
        }

        if (isObservable(cur)) {
            cur = cur.get();
        }
        // Re-render if not currently rendering and value has changed
        if (!inRun && cur !== ret) {
            fr();
        }
        ret = cur;
        inRun = false;

        // Workaround for React 18's double calling useEffect - cached the tracking nodes
        if (process.env.NODE_ENV === 'development') {
            cachedNodes = tracking.nodes;
        }
    };

    let dispose = observe(update);

    if (process.env.NODE_ENV === 'development') {
        useEffect(() => {
            // Workaround for React 18's double calling useEffect. If this is the
            // second useEffect, set up tracking again.
            if (dispose === undefined) {
                dispose = setupTracking(cachedNodes, update, /*noArgs*/ true);
            }
            return () => {
                dispose();
                dispose = undefined;
            };
        });
    } else {
        // Return dispose to cleanup before each render or on unmount
        useEffect(() => dispose);
    }

    return ret;
}
