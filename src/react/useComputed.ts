import { useMemo, useState } from 'react';
import { effect } from 'src/effect';

export function useComputed<T>(selector: () => T, deps: any[]): T {
    // Do computed computation inside a useMemo so we can get an initial value
    const initial = useMemo(() => {
        let prevValue;
        // Do this in an effect to track automatically
        effect(() => {
            const v = selector();
            // If the selector value is different than previously
            if (v !== prevValue) {
                prevValue = v;
                // setValue may be undefined if this is the first run
                setValue?.(v);
            }
        });

        return prevValue;
    }, deps || []);

    const [value, setValue] = useState(initial);

    return value;
}
