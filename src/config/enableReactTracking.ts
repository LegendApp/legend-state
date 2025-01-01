import { type GetOptions, internal, isObject, tracking, type NodeInfo, type TrackingType } from '@legendapp/state';
import { configureLegendState } from '@legendapp/state/config/configureLegendState';
import { UseSelectorOptions, useSelector } from '@legendapp/state/react';
import { createContext, useContext } from 'react';
// @ts-expect-error Internals
import { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as ReactInternals } from 'react';

interface ReactTrackingOptions {
    auto?: boolean; // Make all get() calls act as useSelector() hooks
    warnUnobserved?: boolean; // Warn if get() is used outside of an observer
    warnMissingUse?: boolean; // Warn if get() is used in a component
}

export function enableReactTracking({ auto, warnUnobserved, warnMissingUse }: ReactTrackingOptions) {
    const { get } = internal;

    if (auto || (process.env.NODE_ENV === 'development' && (warnUnobserved || warnMissingUse))) {
        const ReactRenderContext = createContext(0);

        const isInRender = () => {
            // If we're already tracking then we definitely don't need useSelector
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
            return false;
        };

        const isObserved = () => {
            // If we're already tracking then we definitely don't need useSelector
            return !!tracking.current;
        };

        const needsSelector = () => {
            // If we're already tracking then we definitely don't need useSelector
            if (!isObserved()) {
                return isInRender();
            }
            return false;
        };

        configureLegendState({
            observableFunctions: {
                get: (node: NodeInfo, options?: TrackingType | (GetOptions & UseSelectorOptions)) => {
                    if (process.env.NODE_ENV === 'development' && warnMissingUse) {
                        if (isInRender()) {
                            if (isObserved()) {
                                console.warn(
                                    '[legend-state] Detected a `get()` call in an observer component. It is recommended to use the `use$` hook instead to be compatible with React Compiler: https://legendapp.com/open-source/state/v3/react/react-api/#use$',
                                );
                            } else {
                                console.warn(
                                    '[legend-state] Detected a `get()` call in a component. You likely want to use the `use$` hook to be reactive to it changing, or change `get()` to `peek()` to get the value without tracking: https://legendapp.com/open-source/state/v3/react/react-api/#use$',
                                );
                            }
                        }
                    } else if (needsSelector()) {
                        if (auto) {
                            return useSelector(() => get(node, options), isObject(options) ? options : undefined);
                        } else if (process.env.NODE_ENV === 'development' && warnUnobserved) {
                            console.warn(
                                '[legend-state] Detected a `get()` call in an unobserved component. You may want to wrap it in observer: https://legendapp.com/open-source/state/v3/react/react-api/#observer',
                            );
                        }
                    }
                    return get(node, options);
                },
            },
        });
    }
}
