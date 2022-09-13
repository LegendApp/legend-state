import { observe, setupTracking, tracking } from '@legendapp/state';
import { useEffect } from 'react';

export function useObserve(selector: () => void) {
    // Development-only workaround for React 18 double calling useEffect
    if (process.env.NODE_ENV === 'development') {
        let cachedNodes;
        const update = () => {
            selector();
            cachedNodes = tracking.nodes;
        };
        let dispose = observe(update);
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
        const dispose = observe(selector);
        // Return dispose to cleanup before each render or on unmount
        useEffect(() => dispose);
    }
}
