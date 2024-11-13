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

export function useObserve<T>(run: (e: ObserveEvent<T>) => T | void, options?: UseObserveOptions): () => void;
export function useObserve<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: UseObserveOptions,
): () => void;
export function useObserve<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | UseObserveOptions,
    options?: UseObserveOptions,
): () => void {
    let reaction: ((e: ObserveEventCallback<T>) => any) | undefined;
    if (isFunction(reactionOrOptions)) {
        reaction = reactionOrOptions;
    } else {
        options = reactionOrOptions;
    }

    const deps = options?.deps;

    // Create a deps observable to be watched by the created observable
    const depsObs$ = deps ? useObservable(deps) : undefined;
    // Update depsObs with the deps array
    if (depsObs$) {
        depsObs$.set(deps! as any[]);
    }

    const ref = useRef<{
        selector?: Selector<T> | ((e: ObserveEvent<T>) => T | void) | ObservableParam<T>;
        reaction?: (e: ObserveEventCallback<T>) => any;
        dispose?: () => void;
    }>({});

    ref.current.selector = deps
        ? () => {
              depsObs$?.get();
              return computeSelector(selector);
          }
        : selector;
    ref.current.reaction = reaction;

    if (!ref.current.dispose) {
        ref.current.dispose = observe<T>(
            ((e: ObserveEventCallback<T>) => computeSelector(ref.current.selector, undefined, e)) as any,
            (e) => ref.current.reaction?.(e),
            options,
        );
    }

    useUnmountOnce(() => {
        ref.current?.dispose?.();
    });

    return ref.current.dispose;
}
