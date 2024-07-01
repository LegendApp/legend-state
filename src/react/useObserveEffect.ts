import { ObservableParam, ObserveEvent, ObserveEventCallback, Selector, isFunction, observe } from '@legendapp/state';
import { useRef } from 'react';
import { useMountOnce } from './useMount';
import { useObservable } from './useObservable';
import type { UseObserveOptions } from './useObserve';

export function useObserveEffect<T>(run: (e: ObserveEvent<T>) => T | void, options?: UseObserveOptions): void;
export function useObserveEffect<T>(
    selector: Selector<T>,
    reaction?: (e: ObserveEventCallback<T>) => any,
    options?: UseObserveOptions,
): void;
export function useObserveEffect<T>(
    selector: Selector<T> | ((e: ObserveEvent<T>) => any),
    reactionOrOptions?: ((e: ObserveEventCallback<T>) => any) | UseObserveOptions,
    options?: UseObserveOptions,
): void {
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
        selector: Selector<T> | ((e: ObserveEvent<T>) => T | void) | ObservableParam<T>;
        reaction?: (e: ObserveEventCallback<T>) => any;
    }>({ selector });
    ref.current = { selector, reaction };

    useMountOnce(() =>
        observe<T>(
            ((e: ObserveEventCallback<T>) => {
                const { selector } = ref.current as { selector: (e: ObserveEvent<T>) => T | void };
                depsObs$?.get();
                return isFunction(selector) ? selector(e) : selector;
            }) as any,
            (e) => ref.current.reaction?.(e),
            options,
        ),
    );
}
