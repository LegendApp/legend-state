import { effect, setupTracking, tracking } from '@legendapp/state';
import { useEffect } from 'react';
import { useForceRender } from './useForceRender';

export function useComputed<T>(selector: () => T) {
    let inRun = true;
    let ret: T;
    let cachedNodes;

    const forceRender = useForceRender();

    const update = function () {
        if (inRun) {
            // If running, run and return the component
            ret = selector();
        } else {
            // If not running, this is from observable changing so trigger a render
            forceRender();
        }
        inRun = false;

        // Workaround for React 18's double calling useEffect - cached the tracking nodes
        if (process.env.NODE_ENV === 'development') {
            cachedNodes = tracking.nodes;
        }
    };

    let dispose = effect(update);

    if (process.env.NODE_ENV === 'development') {
        useEffect(() => {
            // Workaround for React 18's double calling useEffect. If this is the
            // second useEffect, set up tracking again.
            if (dispose === undefined) {
                dispose = setupTracking(cachedNodes, update);
            }
            return () => {
                dispose();
                dispose = undefined;
            };
        });
    } else {
        // Return dispose to cleanup before each render or unmount
        useEffect(() => dispose);
    }

    return ret;
}
