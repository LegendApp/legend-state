import { configureLegendState, internal, type NodeValue, tracking, type TrackingType } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { createContext, useContext } from 'react';
// @ts-expect-error Internals
import { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as ReactInternals } from 'react';

const ReactRenderContext = createContext(0);

function needsSelector() {
    // If we're already tracking then we definitely don't need useSelector
    if (!tracking.current) {
        try {
            // If there's no dispatcher we're definitely not in React
            // This is an optimization to not need to run useContext. If in a future React version
            // this works differently we can change it or just remove it.
            const dispatcher = ReactInternals.ReactCurrentDispatcher.current;
            if (dispatcher) {
                // If there's a dispatcher then we may be inside of a hook.
                // Attempt a useContext hook, which will throw an error if outside of render.
                useContext(ReactRenderContext);
                return true;
            }
        } catch {} // eslint-disable-line no-empty
    }
    return false;
}

export function enableReactAutoTracking() {
    const { get } = internal;

    configureLegendState({
        observableFunctions: {
            get: (node: NodeValue, track: TrackingType) => {
                if (needsSelector()) {
                    return useSelector(() => get(node, track));
                } else {
                    return get(node, track);
                }
            },
        },
    });
}
