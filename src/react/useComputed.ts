import { onChange, tracking } from '@legendapp/state';
import { useEffect, useMemo, useState } from 'react';

export function useComputed<T>(selector: () => T): T {
    const [intialValue, tracked] = useMemo(() => {
        tracking.is = true;
        tracking.nodes = [];

        const val = selector();

        tracking.is = false;

        return [val, tracking.nodes];
    }, []);

    const [value, setValue] = useState(intialValue);

    // Dispose listeners on unmount
    useEffect(() => {
        let listeners = [];
        let prev = value;
        const onUpdate = () => {
            const v = selector();
            if (v !== prev) {
                prev = v;
                setValue(v);
            }
        };
        for (let { node } of tracked) {
            // Todo shallow
            listeners.push(onChange(node, onUpdate));
        }
        return () => {
            for (let i = 0; i < listeners.length; i++) {
                listeners[i].dispose();
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return value;
}
