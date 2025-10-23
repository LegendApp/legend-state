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
import { useUnmountOnce } from './useUnmount';
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
    }>({});

    ref.current.selector = selector;
    ref.current.reaction = reaction;

    // Update depsObs with the deps array
    if (depsObs$) {
        depsObs$.set(deps! as any[]);
    }

    if (!ref.current.dispose) {
        ref.current.dispose = observe<T>(
            ((e: ObserveEventCallback<T>) => {
                depsObs$?.get();
                const selector = ref.current?.selector;
                return computeSelector(selector, undefined, e);
            }) as any,
            (e: ObserveEventCallback<T>) => ref.current.reaction?.(e),
            options as UseObserveOptions,
        );
    }

    useUnmountOnce(() => {
        ref.current?.dispose?.();
    });

    return ref.current.dispose;
}
