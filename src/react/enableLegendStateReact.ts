import {
    beginTracking,
    endTracking,
    extraPrimitiveProps,
    getNodeValue,
    NodeValue,
    setupTracking,
    tracking,
    updateTracking,
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

                return getNodeValue(data);
            },
            () => true
        );

        const hasSymbol = typeof Symbol === 'function' && Symbol.for;
        const ReactTypeofSymbol = hasSymbol ? Symbol.for('react.element') : (createElement('a') as any).$$typeof;

        // Set extra props for the proxyHandler to return on primitives
        extraPrimitiveProps.set('$$typeof', ReactTypeofSymbol);
        extraPrimitiveProps.set('type', Text);
        extraPrimitiveProps.set('props', {
            __fn: (obs) => ({ data: obs }),
        });
        extraPrimitiveProps.set('ref', null);

        // 2. Override dispatcher access to hook up tracking
        let dispatcher;
        let didBeginTracking = false;
        let prevNodes;
        Object.defineProperty(ReactInternals.ReactCurrentDispatcher, 'current', {
            get() {
                return dispatcher;
            },
            set(newDispatcher) {
                if (newDispatcher) {
                    const useCallback = newDispatcher.useCallback;
                    // When the React render is complete it sets the dispatcher to an object where useCallback has a length of 0
                    if (dispatcher && didBeginTracking && useCallback.length < 2) {
                        didBeginTracking = false;
                        // If the previous dispatcher tracked nodes then set up hooks
                        if (tracking.nodes) {
                            try {
                                let forceRender = dispatcher.useReducer(Updater, 0)[1];

                                let noArgs = true;
                                if (process.env.NODE_ENV === 'development') {
                                    tracking.listeners?.(tracking.nodes);
                                    if (tracking.updates) {
                                        noArgs = false;
                                        forceRender = tracking.updates(forceRender);
                                    }
                                }

                                // Track all of the nodes accessed during the dispatcher
                                let dispose = setupTracking(tracking.nodes, forceRender, /*noArgs*/ noArgs);

                                if (process.env.NODE_ENV === 'development') {
                                    // Clear tracing
                                    tracking.listeners = undefined;
                                    tracking.updates = undefined;

                                    const cachedNodes = tracking.nodes;
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
                            dispatcher.useReducer(Updater, 0);
                            dispatcher.useEffect(EmptyEffect);
                        }

                        // Restore the previous tracking context
                        endTracking(prevNodes);
                    }
                    dispatcher = newDispatcher;

                    // Start a new tracking context when entering a new rendering dispatcher
                    // In development, rendering dispatchers have useCallback named either "mountHookTypes" or "updateHookTypes"
                    // In production, they just have length = 2
                    if (
                        !tracking.isTracking &&
                        (process.env.NODE_ENV === 'development'
                            ? !useCallback.toString().includes('Invalid')
                            : useCallback.length === 2)
                    ) {
                        didBeginTracking = true;

                        // Keep a copy of the previous tracking context
                        prevNodes = beginTracking();
                    }
                }
            },
        });
    }
}
