import {
    beginTracking,
    endTracking,
    extraPrimitiveProps,
    getNodeValue,
    NodeValue,
    setupTracking,
    tracking,
    updateTracking,
    ObservablePrimitiveClass,
} from '@legendapp/state';
import {
    createElement,
    memo,
    // @ts-ignore
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as ReactInternals,
} from 'react';
let isEnabled = false;

const Updater = (s) => s + 1;
const EmptyEffect = () => {};

export function enableLegendStateReact() {
    if (!isEnabled) {
        isEnabled = true;

        // Inspired by Preact Signals: https://github.com/preactjs/signals/blob/main/packages/react/src/index.ts

        // 1. Add the extra primitive props so that observables can render directly
        // Memoized component to wrap the observable value
        const Text = memo(
            function Text({ data }: { data: NodeValue }) {
                updateTracking(data);

                return getNodeValue(data) ?? null;
            },
            () => true
        );

        const hasSymbol = typeof Symbol === 'function' && Symbol.for;
        const ReactTypeofSymbol = hasSymbol ? Symbol.for('react.element') : (createElement('a') as any).$$typeof;

        // Set extra props for the proxyHandler to return on primitives
        extraPrimitiveProps.set('$$typeof', ReactTypeofSymbol);
        extraPrimitiveProps.set('type', Text);
        extraPrimitiveProps.set('_store', { validated: true });
        extraPrimitiveProps.set('key', '');
        extraPrimitiveProps.set('props', {
            __fn: (obs) => ({ data: obs }),
        });
        extraPrimitiveProps.set('ref', null);
        // Set extra props for ObservablePrimitive to return on primitives
        Object.defineProperties(ObservablePrimitiveClass.prototype, {
            $$typeof: { configurable: true, value: ReactTypeofSymbol },
            type: { configurable: true, value: Text },
            props: {
                configurable: true,
                get() {
                    return { data: (this as ObservablePrimitiveClass).getNode() };
                },
            },
            ref: { configurable: true, value: null },
        });

        // 2. Override dispatcher access to hook up tracking
        let dispatcher;
        let numTracking = 0;
        let prevNodes;
        let lock;
        Object.defineProperty(ReactInternals.ReactCurrentDispatcher, 'current', {
            get() {
                return dispatcher;
            },
            set(newDispatcher) {
                // Skip this inside a recursive set from our usage of useReducer/useEffect
                if (newDispatcher && !lock) {
                    lock = true;
                    const useCallback = newDispatcher.useCallback;
                    // When the React render is complete it sets the dispatcher to an object where useCallback has a length of 0
                    if (dispatcher && numTracking > 0 && useCallback.length < 2) {
                        numTracking--;
                        // If the previous dispatcher tracked nodes then set up hooks
                        const tracker = tracking.current;
                        if (tracker) {
                            try {
                                let forceRender = dispatcher.useReducer(Updater, 0)[1];

                                let noArgs = true;
                                if (process.env.NODE_ENV === 'development') {
                                    tracker.traceListeners?.(tracker.nodes);
                                    if (tracker.traceUpdates) {
                                        noArgs = false;
                                        forceRender = tracker.traceUpdates(forceRender);
                                    }
                                }

                                // Track all of the nodes accessed during the dispatcher
                                let dispose = setupTracking(tracker.nodes, forceRender, /*noArgs*/ noArgs);

                                if (process.env.NODE_ENV === 'development') {
                                    // Clear tracing
                                    tracker.traceListeners = undefined;
                                    tracker.traceUpdates = undefined;

                                    const cachedNodes = tracker.nodes;
                                    dispatcher.useEffect(() => {
                                        // Workaround for React 18's double calling useEffect. If this is the
                                        // second useEffect, set up tracking again.
                                        if (dispose === undefined) {
                                            dispose = setupTracking(cachedNodes, forceRender, /*noArgs*/ noArgs);
                                        }
                                        return () => {
                                            dispose();
                                            dispose = undefined;
                                        };
                                    });
                                } else {
                                    // Return dispose to cleanup before each render or on unmount
                                    dispatcher.useEffect(() => dispose);
                                }
                            } catch (err) {
                                // This may not ever be an error but since this is new we'll leave this here
                                // for a bit while we see what the behavior is like
                                if (process.env.NODE_ENV === 'development') {
                                    console.error('[legend-state] error creating hooks', err);
                                    throw new Error('[legend-state] error creating hooks');
                                }
                            }
                        } else {
                            // Wrap in try/catch because this can sometimes cause errors,
                            // like when hydrating in Next.js
                            try {
                                // Run empty hooks if not tracking nodes, to keep the same number of hooks per render
                                dispatcher.useReducer(Updater, 0);
                                dispatcher.useEffect(EmptyEffect);
                            } catch {}
                        }

                        // Restore the previous tracking context
                        endTracking(prevNodes);
                    }

                    // Start a new tracking context when entering a new rendering dispatcher
                    // In development, rendering dispatchers have useCallback named either "mountHookTypes" or "updateHookTypes"
                    // In production, they just have length = 2
                    if (
                        !numTracking &&
                        (process.env.NODE_ENV === 'development'
                            ? !useCallback.toString().includes('Invalid')
                            : useCallback.length === 2)
                    ) {
                        numTracking++;

                        // Keep a copy of the previous tracking context
                        prevNodes = beginTracking();
                    }
                    lock = false;
                }

                dispatcher = newDispatcher;
            },
        });
    }
}
