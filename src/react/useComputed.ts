import { ObservableListenerDispose } from '@legendapp/state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listenWhileCalling } from './listenWhileCalling';

export function useComputed<T>(selector: () => T, deps: any[]): T {
    const ref = useRef<Set<ObservableListenerDispose>>();
    if (!ref.current) ref.current = new Set();

    // Do all the computed magic inside a useMemo so we can get an initial value
    const initial = useMemo(() => {
        let prevValue;
        const onChange = () => {
            const v = selector();
            // If the selector value is different than previously
            if (v !== prevValue) {
                prevValue = v;
                setValue(v);
            }
        };
        // Set up all the listeners while computing the value
        prevValue = listenWhileCalling(selector, ref.current, onChange);

        return prevValue;
    }, deps || []);

    const [value, setValue] = useState(initial);

    // Clean up listeners on the way out
    useEffect(() => () => ref.current.forEach((dispose) => dispose()), []);

    return value;
}
