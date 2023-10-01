import {
    computeSelector,
    isPrimitive,
    isPromise,
    ListenerParams,
    Selector,
    tracking,
    trackSelector,
} from '@legendapp/state';
import { useRef } from 'react';
import { UseSelectorOptions } from 'src/react/reactInterfaces';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

interface SelectorFunctions<T> {
    subscribe: (onStoreChange: () => void) => () => void;
    getVersion: () => number;
    run: (selector: Selector<T>) => T;
}

function createSelectorFunctions<T>(options: UseSelectorOptions | undefined): SelectorFunctions<T> {
    let version = 0;
    let notify: () => void;
    let dispose: (() => void) | undefined;
    let resubscribe: (() => void) | undefined;
    let _selector: Selector<T>;
    let prev: T;

    const _update = ({ value }: ListenerParams) => {
        // If skipCheck then don't need to re-run selector
        let changed = options?.skipCheck;
        if (!changed) {
            // Re-run the selector to get the new value
            const newValue = computeSelector(_selector);
            // If newValue is different than previous value then it's changed.
            // Also if the selector returns an observable directly then its value will be the same as
            // the value from the listener, and that should always re-render.
            if (newValue !== prev || (!isPrimitive(newValue) && newValue === value)) {
                changed = true;
            }
        }
        if (changed) {
            version++;
            notify?.();
        }
    };

    return {
        subscribe: (onStoreChange: () => void) => {
            notify = onStoreChange;

            // Workaround for React 18 running twice in dev (part 2)
            if (
                (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
                !dispose &&
                resubscribe
            ) {
                resubscribe();
            }

            return () => {
                dispose?.();
                dispose = undefined;
            };
        },
        getVersion: () => version,
        run: (selector: Selector<T>) => {
            // Update the cached selector
            _selector = selector;
            // Dispose if already listening
            dispose?.();

            const {
                value,
                dispose: _dispose,
                resubscribe: _resubscribe,
            } = trackSelector(selector, _update, undefined, undefined, /*createResubscribe*/ true, /*inRender*/ true);

            dispose = _dispose;
            resubscribe = _resubscribe;

            prev = value;

            return value;
        },
    };
}

export function useSelector<T>(selector: Selector<T>, options?: UseSelectorOptions): T {
    // Short-circuit to skip creating the hook if the parent component is an observer
    if (tracking.inRender) {
        return computeSelector(selector);
    }

    const ref = useRef<SelectorFunctions<T>>();
    if (!ref.current) {
        ref.current = createSelectorFunctions<T>(options);
    }
    const { subscribe, getVersion, run } = ref.current;

    // Run the selector
    // Note: The selector needs to run on every render because it may have different results
    // than the previous run if it uses local state
    const value = run(selector) as any;

    useSyncExternalStore(subscribe, getVersion, getVersion);

    // Suspense support
    // Note: We may want to change the throw to React.use when React updates their guidances on Suspense.
    if (options?.suspend) {
        if (isPromise(value)) {
            throw value;
        } else if (value?.error) {
            throw value.error;
        }
    }

    return value;
}
