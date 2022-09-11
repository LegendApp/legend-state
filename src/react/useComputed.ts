import { observe, setupTracking, symbolUndef, tracking } from '@legendapp/state';
import { useEffect } from 'react';
import { useForceRender } from './useForceRender';

/**
 * Runs the specified selector, automatically tracking observable access and optionally re-rendering
 * @param selector A computation function
 * @param whenToRender When to re-render. false = never re-render, undefined = render if different, true = always render
 */
export function useComputed<T>(selector: () => T, whenToRender?: boolean) {
    let inRun = true;

    let ret: T = symbolUndef as unknown as T;
    let cachedNodes;

    const fr = whenToRender !== false && useForceRender();

    const update = function () {
        // If running, run and return the value
        // Don't need to run the selector again if not running and alwaysUpdate
        if (inRun || !whenToRender) {
            const cur = selector();
            // Re-render if not currently rendering and value has changed
            if (!inRun && cur !== ret && whenToRender !== false) {
                // Re-render if value changed
                fr();
            }
            ret = cur;
        } else if (whenToRender) {
            fr();
        }
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
                dispose = setupTracking(cachedNodes, update);
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
