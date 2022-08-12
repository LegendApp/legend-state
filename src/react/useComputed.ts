import { ObservableListenerDispose } from '@legendapp/state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listenWhileCalling } from './listenWhileCalling';

interface SavedRef {
    listeners: Set<ObservableListenerDispose>;
    value: any;
}

export function useComputed<T>(selector: () => T, deps: any[]): T {
    const ref = useRef<SavedRef>({ listeners: new Set(), value: undefined });

    const initial = useMemo(() => {
        const onChange = () => {
            const v = selector();
            if (v !== ref.current.value) {
                ref.current.value = v;
                setValue(v);
            }
        };
        return listenWhileCalling(selector, ref.current.listeners, onChange);
    }, deps || []);

    const [value, setValue] = useState(initial);
    ref.current.value = value;

    useEffect(() => () => ref.current.listeners.forEach((dispose) => dispose()), []);

    return value;
}
