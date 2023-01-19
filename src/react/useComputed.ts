import { computed, isArray, ObservableComputed, ObservableComputedTwoWay } from '@legendapp/state';
import { useMemo, useRef } from 'react';

export function useComputed<T>(compute: () => T | Promise<T>): ObservableComputed<T>;
export function useComputed<T>(compute: () => T | Promise<T>, deps: any[]): ObservableComputed<T>;
export function useComputed<T>(compute: () => T | Promise<T>, set: (value: T) => void): ObservableComputedTwoWay<T>;
export function useComputed<T>(
    compute: () => T | Promise<T>,
    set: (value: T) => void,
    deps: any[]
): ObservableComputedTwoWay<T>;
export function useComputed<T>(
    compute: () => T | Promise<T>,
    set?: ((value: T) => void) | any[],
    deps?: any[]
): ObservableComputed<T> | ObservableComputedTwoWay<T> {
    if (!deps && isArray(set)) {
        deps = set;
        set = undefined;
    }
    const ref = useRef<{ compute?: () => T | Promise<T>; set?: (value: T) => void }>({});
    ref.current.compute = compute;
    ref.current.set = set as (value: T) => void;

    return useMemo(
        () => computed(() => ref.current.compute(), set ? (value) => ref.current.set(value) : undefined),
        deps || []
    );
}
