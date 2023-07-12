import {
    observable,
    Observable,
    ObservableComputed,
    ObservableComputedTwoWay,
    ObservableReadable,
} from '@legendapp/state';
import { useMemo } from 'react';

export function useObs<T>(value: undefined | null): Observable<T>;
export function useObs<T extends ObservableReadable>(compute: () => T | Promise<T>): T;
export function useObs<T>(compute: () => T | Promise<T>): ObservableComputed<T>;
export function useObs<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set: (value: T2) => void
): ObservableComputedTwoWay<T, T2>;
export function useObs<T>(value?: T | Promise<T>): Observable<T>;
export function useObs<T>(value?: any, set?: any): any {
    // Create the observable from the default value
    return useMemo(() => observable<T>(value, set, { activateImmediately: true }), []);
}
