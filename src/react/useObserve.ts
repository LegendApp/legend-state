import {
    computeSelector,
    isFunction,
    ObservableParam,
    observe,
    ObserveEvent,
    ObserveEventCallback,
    Selector,
    ObserveOptions,
} from '@legendapp/state';
import { useRef } from 'react';
import { runInRender } from './react-globals';
import { useMountOnce } from './useMount';
import { useObservable } from './useObservable';

export interface UseObserveOptions extends ObserveOptions {
    deps?: any[];
}

export function useObserve<T>(run: (e: ObserveEvent<T>) => T | void): () => void;
export function useObserve<T>(run: (e: ObserveEvent<T>) => T | void, deps?: any[]): () => void;
export function useObserve<T>(run: (e: ObserveEvent<T>) => T | void, options?: UseObserveOptions): () => void;
export function useObserve<T>(
    run: (e: ObserveEvent<T>) => T | void,
    options?: UseObserveOptions,
    deps?: any[],
): () => void;
export function useObserve<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: UseObserveOptions,
): () => void;
export function useObserve<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: UseObserveOptions,
    deps?: any[],
): () => void;
export function useObserve<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptionsOrDeps?: ((e: ObserveEventCallback<T>) => any) | UseObserveOptions | any[],
    options?: UseObserveOptions | any[],
    deps?: any[],
): () => void {
    let reaction: ((e: ObserveEventCallback<T>) => any) | undefined;
    // Check second param
    if (isFunction(reactionOrOptionsOrDeps)) {
        reaction = reactionOrOptionsOrDeps;
    } else if (Array.isArray(reactionOrOptionsOrDeps)) {
        deps = reactionOrOptionsOrDeps;
        options = undefined;
    } else {
        options = reactionOrOptionsOrDeps;
    }

    // Check third param
    // Handle the case where options might actually be deps when we have a reaction
    if (reaction && Array.isArray(options)) {
        deps = options;
        options = undefined;
    }

    // Check last param for deps
    deps = deps || (options as UseObserveOptions)?.deps;

    // Create a deps observable to be watched by the created observable
    const depsObs$ = deps ? useObservable(deps) : undefined;

    const ref = useRef<{
        selector?: Selector<T> | ((e: ObserveEvent<T>) => T | void) | ObservableParam<T>;
        reaction?: (e: ObserveEventCallback<T>) => any;
        dispose?: () => void;
        stop?: () => void;
        stopped?: boolean;
        mounted?: boolean;
        missed?: boolean;
    }>({});

    ref.current.selector = selector;
    ref.current.reaction = reaction;

    // Update depsObs with the deps array
    if (depsObs$) {
        runInRender(() => depsObs$.set(deps! as any[]));
    }

    const create = () => {
        const current = ref.current;
        let isInitial = true;
        current.missed = false;
        current.dispose = observe<T>(
            ((e: ObserveEventCallback<T>) => {
                // Changes before mount are replayed on mount. Skipping the selector also drops all tracking,
                // so an observer from a render that never commits stops listening instead of leaking.
                if (!isInitial && !current.mounted) {
                    current.missed = true;
                    return;
                }
                depsObs$?.get();
                return computeSelector(current.selector, undefined, e);
            }) as any,
            (e: ObserveEventCallback<T>) => {
                if (isInitial || current.mounted) {
                    current.reaction?.(e);
                }
            },
            options as UseObserveOptions,
        );
        isInitial = false;
    };

    if (!ref.current.dispose && !ref.current.stopped) {
        runInRender(create);
    }

    useMountOnce(() => {
        const current = ref.current;
        current.mounted = true;
        // Recreate if effect cleanup disposed it (such as Activity hide/show) or a change arrived before mount
        if (current.missed) {
            current.dispose?.();
            current.dispose = undefined;
        }
        if (!current.dispose && !current.stopped) {
            create();
        }
        return () => {
            current.mounted = false;
            current.dispose?.();
            current.dispose = undefined;
        };
    });

    // Stable across recreations, and stays stopped through later remounts
    return (ref.current.stop ??= () => {
        const current = ref.current;
        current.stopped = true;
        current.dispose?.();
        current.dispose = undefined;
    });
}
