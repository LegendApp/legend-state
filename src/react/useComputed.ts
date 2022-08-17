import { ObservableListenerDispose } from '@legendapp/state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useObserver } from './useObserver';

export function useComputed<T>(selector: () => T, deps: any[]): T {
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
        prevValue = useObserver(selector, onChange);

        return prevValue;
    }, deps || []);

    const [value, setValue] = useState(initial);

    return value;
}
