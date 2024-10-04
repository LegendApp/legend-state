import { Selector, when, whenReady } from '@legendapp/state';
import { useMemo } from 'react';

export function useWhen<T>(predicate: Selector<T>): Promise<T>;
export function useWhen<T, T2>(predicate: Selector<T>, effect: (value: T) => T2): Promise<T2>;
export function useWhen<T, T2>(predicate: Selector<T>, effect?: (value: T) => T2): Promise<T2> {
    return useMemo(() => when<T, T2>(predicate, effect as any), []);
}
export function useWhenReady<T>(predicate: Selector<T>): Promise<T>;
export function useWhenReady<T, T2>(predicate: Selector<T>, effect: (value: T) => T2 | (() => T2)): Promise<T2>;
export function useWhenReady<T, T2>(predicate: Selector<T>, effect?: (value: T) => T2 | (() => T2)): Promise<T2> {
    return useMemo(() => whenReady<T, T2>(predicate, effect as any), []);
}
