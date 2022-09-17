import { observe } from '@legendapp/state';
import { useEffect, useRef } from 'react';

export function useObserve(selector: () => void): void {
    const cb = useRef(selector);
    cb.current = selector;

    useEffect(() => {
        return observe(cb.current);
    }, []);
}
