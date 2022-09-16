import { observe } from '@legendapp/state';
import { useEffect } from 'react';

export function useObserve(selector: () => void, deps?: any[]): void {
    useEffect(() => {
        const dispose = observe(selector);

        return dispose;
    }, deps || [selector]);
}
