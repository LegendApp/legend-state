import { observe } from '@legendapp/state';
import { useEffect, useRef } from 'react';
import { computeSelector, Selector } from './reactHelpers';

export function useObserve<T>(selector: Selector<T>): void {
    const ref = useRef<Selector<T>>();
    ref.current = selector;

    useEffect(() => {
        return observe(() => computeSelector(ref.current));
    }, []);
}
