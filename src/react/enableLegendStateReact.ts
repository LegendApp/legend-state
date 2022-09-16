import {
    beginTracking,
    endTracking,
    extraPrimitiveProps,
    getNodeValue,
    NodeValue,
    ObservablePrimitive,
    scheduleSweep,
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
        // Set extra props for ObservablePrimitive to return on primitives
        Object.defineProperties(ObservablePrimitive.prototype, {
            $$typeof: { configurable: true, value: ReactTypeofSymbol },
            type: { configurable: true, value: Text },
            props: {
                configurable: true,
                get() {
                    return { data: (this as ObservablePrimitive).getNode() };
                },
            },
            ref: { configurable: true, value: null },
        });

        const mapOwnersDispose = new WeakMap<any, () => void>();

        const Updater = (s) => s + 1;

        function runOwnerDisposes(owner) {
            // Dispose old listeners if exists
            if (owner) {
                const disposeOld = mapOwnersDispose.get(owner);
                if (disposeOld) {
                    tracking.callbacksMarked.delete(disposeOld);
                    disposeOld();
                    mapOwnersDispose.delete(owner);
                }
            }
        }

        // 2. Override dispatcher access to hook up tracking
        let dispatcher;
        let didBeginTracking = false;
        let prevNodes;
        Object.defineProperty(ReactInternals.ReactCurrentDispatcher, 'current', {
            get() {
                return dispatcher;
            },
            set(newDispatcher) {
                const owner = ReactInternals.ReactCurrentOwner.current;
                if (newDispatcher) {
                    // If owner then this might be a component
                    if (owner) {
                        const useCallback = newDispatcher.useCallback;
                        // Check properties of newDispatcher's useCallback to determine whether this is a component and we should do the work
                        // Filter out dispatchers for hooks because we don't care about those

                        // When the React render is complete it sets the dispatcher to an object where useCallback has a length of 0
                        // So this will be the end of the render of the previous dispatcher
                        // And we track all accessed nodes
                        if (dispatcher && didBeginTracking && useCallback.length < 2) {
                            if (process.env.NODE_ENV === 'development' && dispatcher !== didBeginTracking) {
                                throw new Error('[legend-state] Unexpected dispatcher');
                            }

                            didBeginTracking = undefined;
                            // If the previous dispatcher tracked nodes then set up hooks
                            if (tracking.nodes) {
                                try {
                                    let dispose;
                                    let forceRender = dispatcher.useReducer(Updater, 0)[1];

                                    let noArgs = true;
                                    // Hook into tracking if user requested it
                                    if (process.env.NODE_ENV === 'development') {
                                        tracking.listeners?.(tracking.nodes);
                                        if (tracking.updates) {
                                            noArgs = false;
                                            forceRender = tracking.updates(forceRender);
                                        }
                                    }

                                    // Dispose old listeners if exists
                                    runOwnerDisposes(owner);
                                    runOwnerDisposes(owner.alternate);

                                    // Track all of the nodes accessed during the dispatcher
                                    dispose = setupTracking(
                                        tracking.nodes,
                                        forceRender,
                                        /*noArgs*/ noArgs,
                                        /*markAndSweep*/ true
                                    );

                                    // Add this dispose function to the map to be able to clear listeners on the next run
                                    mapOwnersDispose.set(owner, dispose);
                                } catch (err) {
                                    // This may not ever be an error but since this is new we'll leave this here
                                    // for a bit while we see what the behavior is like
                                    if (process.env.NODE_ENV === 'development') {
                                        console.error('[legend-state] error creating hooks', err);
                                        throw new Error('[legend-state] error creating hooks');
                                    }
                                }

                                // Note that there is no useEffect to handle unmount. State listeners are handled lazily -
                            } else {
                                // Run empty hook if not tracking nodes, to keep the same number of hooks per render
                                dispatcher.useReducer(Updater, 0);
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
                            didBeginTracking = dispatcher;

                            // Keep a copy of the previous tracking context
                            prevNodes = beginTracking();
                        }
                    }
                } else if (!owner) {
                    scheduleSweep();
                }
                dispatcher = newDispatcher;
            },
        });
    }
}
