import type { Observable } from '@legendapp/state';
import { useObservable } from './useObservable';
import { useSelector } from './useSelector';

export function useObservableState<T>(initialValue?: T | (() => T) | (() => Promise<T>)): [T, Observable<T>] {
    const obs$ = useObservable(initialValue);
    return [useSelector(obs$), obs$];
}
