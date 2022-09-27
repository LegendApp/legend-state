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
        extraPrimitiveProps.set(Symbol.toPrimitive, (_: any, value: any) => value);
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
            [Symbol.toPrimitive]: {
                configurable: true,
                get() {
                    return (this as ObservablePrimitiveClass).peek();
                },
            },
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
        const mapDisposes: WeakMap<() => void, () => void> = new WeakMap();

        // Track the component lifecycle using React's internal dispatcher changing. At the beginning of a component's render
        // we start a new tracking context and then at the end of a render we inject a useReducer and add a listener
        // to all tracked nodes to force render using the useReducer.
        Object.defineProperty(ReactInternals.ReactCurrentDispatcher, 'current', {
            get() {
                return dispatcher;
            },
            set(newDispatcher) {
                // Skip this inside a recursive set from our usage of useReducer
                if (newDispatcher && !lock) {
                    lock = true;
                    const useCallback = newDispatcher.useCallback;
                    // 1. Render Start
                    // Start a new tracking context when entering a new rendering dispatcher
                    // In development, rendering dispatchers have useCallback named either "mountHookTypes" or "updateHookTypes"
                    // In production, they just have length = 2
                    if (!numTracking && useCallback.length === 2) {
                        numTracking++;

                        // Keep a copy of the previous tracking context
                        prevNodes = beginTracking();
                    }
                    // 2. Render End
                    // When the React render is complete it sets the dispatcher to an object where useCallback has a length of 0
                    else if (dispatcher && numTracking > 0 && useCallback.length < 2) {
                        numTracking--;
                        // If the previous dispatcher tracked nodes then set up hooks
                        const tracker = tracking.current;
                        if (tracker) {
                            try {
                                const reducer = dispatcher.useReducer(Updater, 0)[1];

                                let forceRender = reducer;

                                // Dispose the previous listener if it exists
                                mapDisposes.get(reducer)?.();

                                let noArgs = true;
                                if (process.env.NODE_ENV === 'development') {
                                    tracker.traceListeners?.(tracker.nodes);
                                    if (tracker.traceUpdates) {
                                        noArgs = false;
                                        forceRender = tracker.traceUpdates(reducer);
                                    }
                                }

                                // Wrap forceRender in a callback to run dispose before forceRender()
                                // This lazily clears out any stale listeners in unmounted components because
                                // they will call onChange and dispose the listeners, but since it won't render
                                // again if it's unmounted, listeners will not be recreated again.
                                function onChange() {
                                    const prevDispose = mapDisposes.get(reducer);
                                    if (prevDispose) {
                                        prevDispose();
                                        mapDisposes.delete(reducer);
                                    }
                                    if (process.env.NODE_ENV === 'development' && !noArgs) {
                                        forceRender.apply(this, arguments);
                                    } else {
                                        forceRender();
                                    }
                                }

                                // Track all of the nodes accessed by this component
                                let dispose = setupTracking(tracker.nodes, onChange, /*noArgs*/ noArgs);

                                // Set this dispose function into the map to clear before the next run
                                mapDisposes.set(reducer, dispose);

                                if (process.env.NODE_ENV === 'development') {
                                    // Clear tracing
                                    tracker.traceListeners = undefined;
                                    tracker.traceUpdates = undefined;
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
                            } catch {}
                        }

                        // Restore the previous tracking context
                        endTracking(prevNodes);
                    }

                    lock = false;
                }

                dispatcher = newDispatcher;
            },
        });
    }
}
