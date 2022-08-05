import { onChange, tracking } from '@legendapp/state';
import { useEffect, useReducer } from 'react';

function useForceRender() {
    const [, forceRender] = useReducer((s) => s + 1, 0);
    return () => forceRender();
}

export function useSelector<T>(selector: () => T): T {
    const forceRender = useForceRender();

    tracking.is = true;
    tracking.nodes = [];

    const val = selector();

    tracking.is = false;

    const tracked = tracking.nodes;

    // Dispose listeners on unmount
    useEffect(() => {
        let listeners = [];
        let prev = val;
        const onUpdate = () => {
            const v = selector();
            if (v !== prev) {
                prev = v;
                forceRender();
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

    return val;
}
