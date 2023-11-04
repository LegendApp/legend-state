import {
    configureLegendState,
    internal,
    type NodeValue,
    tracking,
    type TrackingType,
    isObject,
} from '@legendapp/state';
import { UseSelectorOptions, useSelector } from '@legendapp/state/react';
import { createContext, useContext } from 'react';
import type { RemoveObservables } from '../observableTypes';
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

interface ReactTrackingOptions {
    auto?: boolean; // Make all get() calls act as useSelector() hooks
    warnUnobserved?: boolean; // Warn if get() is used outside of an observer
}

export function enableReactTracking({ auto, warnUnobserved }: ReactTrackingOptions) {
    const { get } = internal;

    configureLegendState({
        observableFunctions: {
            get: (node: NodeValue, options?: TrackingType | (GetOptions & UseSelectorOptions)) => {
                if (needsSelector()) {
                    if (auto) {
                        return useSelector(() => get(node, options), isObject(options) ? options : undefined);
                    } else if (process.env.NODE_ENV === 'development' && warnUnobserved) {
                        console.warn(
                            '[legend-state] Detected a `get()` call in an unobserved component. You may want to wrap it in observer: https://legendapp.com/open-source/state/react-api/#observer-hoc',
                        );
                    }
                }
                return get(node, options);
            },
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { GetOptions, ImmutableObservableBase } from '@legendapp/state';

declare module '@legendapp/state' {
    interface ImmutableObservableBase<T> {
        get(options?: TrackingType | GetOptions | { suspense?: boolean }): RemoveObservables<T>;
    }
}
