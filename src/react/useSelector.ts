import { computeSelector, Selector, tracking, trackSelector } from '@legendapp/state';
import { useRef } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

interface SelectorFunctions<T> {
    subscribe: (onStoreChange: () => void) => void;
    getVersion: () => number;
    run: (selector: Selector<T>) => T;
}

function createSelectorFunctions<T>(): SelectorFunctions<T> {
    let version = 0;
    let notify: () => void;
    let dispose: () => void;
    let resubscribe: () => void;

    const _update = () => {
        version++;
        notify?.();
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
            // Dispose if already listening
            dispose?.();

            const {
                value,
                dispose: _dispose,
                resubscribe: _resubscribe,
            } = trackSelector(selector, _update, undefined, undefined, /*createResubscribe*/ true);

            dispose = _dispose;
            resubscribe = _resubscribe;

            return value;
        },
    };
}

export function useSelector<T>(selector: Selector<T>): T {
    if (tracking.current) {
        return computeSelector(selector);
    }

    const ref = useRef<SelectorFunctions<T>>();
    if (!ref.current) {
        ref.current = createSelectorFunctions<T>();
    }
    const { subscribe, getVersion, run } = ref.current;

    const value = run(selector);

    useSyncExternalStore(subscribe, getVersion, getVersion);

    return value;
}
