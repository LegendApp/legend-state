import { ObservableChecker } from '../observableInterfaces';
import { useCallback } from 'react';
import { assigner, getter, setter } from '../observable';

function usePrimitiveFunction<T>(obs: ObservableChecker, fn: Function) {
    return useCallback(fn(obs), [obs]);
}

export function useSetter<T>(obs: ObservableChecker) {
    return usePrimitiveFunction(obs, setter);
}
export function useGetter<T>(obs: ObservableChecker) {
    return usePrimitiveFunction(obs, getter);
}
export function useAssigner<T>(obs: ObservableChecker) {
    return usePrimitiveFunction(obs, assigner);
}
