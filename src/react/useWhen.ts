import { Selector, when, whenReady } from '@legendapp/state';
import { useMemo } from 'react';

export function useWhen<T>(predicate: Selector<T>, effect: (value: T) => any | (() => any)) {
    return useMemo(() => when(predicate, effect), []);
}
export function useWhenReady<T>(predicate: Selector<T>, effect: (value: T) => any | (() => any)) {
    return useMemo(() => whenReady(predicate, effect), []);
}
