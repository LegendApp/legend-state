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
        const mapDisposes: WeakMap<() => void, () => void> = new WeakMap();

        Object.defineProperty(ReactInternals.ReactCurrentDispatcher, 'current', {
            get() {
                return dispatcher;
            },
            set(newDispatcher) {
                // Skip this inside a recursive set from our usage of useReducer
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

                                // Dispose the previous listener if it exists
                                mapDisposes.get(forceRender)?.();

                                let noArgs = true;
                                if (process.env.NODE_ENV === 'development') {
                                    tracker.traceListeners?.(tracker.nodes);
                                    if (tracker.traceUpdates) {
                                        noArgs = false;
                                        forceRender = tracker.traceUpdates(forceRender);
                                    }
                                }

                                // Wrap forceRender in a callback to run dispose before forceRender()
                                // This lazily clears out any stale listeners by unmounted components because they will call onChange
                                // and we dispose the listeners, but calling react skips the forceRender if it's unmounted
                                // so listeners will not be recreated.
                                function onChange() {
                                    const prevDispose = mapDisposes.get(forceRender);
                                    if (prevDispose) {
                                        prevDispose();
                                        mapDisposes.delete(forceRender);
                                    }
                                    if (process.env.NODE_ENV === 'development' && !noArgs) {
                                        forceRender.apply(this, arguments);
                                    } else {
                                        forceRender();
                                    }
                                }

                                // Track all of the nodes accessed during the dispatcher
                                let dispose = setupTracking(tracker.nodes, onChange, /*noArgs*/ noArgs);

                                // Set this dispose function into the map to clear before the next run
                                mapDisposes.set(forceRender, dispose);

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
