import { ObservableListenerDispose } from '@legendapp/state';
import { useEffect, useReducer, useRef } from 'react';
import { listenWhileCalling } from './listenWhileCalling';

function useForceRender() {
    const [, forceRender] = useReducer((s) => s + 1, 0);
    return () => forceRender();
}

export function useComputed<T>(selector: () => T): T {
    const ref = useRef<Set<ObservableListenerDispose>>(new Set());
    const forceRender = useForceRender();

    useEffect(() => () => ref.current.forEach((dispose) => dispose()), []);
    const value = listenWhileCalling(selector, ref.current, forceRender);

    return value;
}
