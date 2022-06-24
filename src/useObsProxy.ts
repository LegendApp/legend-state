import { useForceRender } from '@legendapp/tools';
import { useEffect, useRef } from 'react';
import { listenToObs } from './ObsProxyFns';
import { MappedProxyValue, ObsListener, ObsProxy } from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';

interface SavedRef {
    args?: ObsProxy[];
    listeners?: ObsListener[];
}

function useObsProxy<T extends ObsProxy[]>(...args: T): MappedProxyValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: [],
        };
    }

    const prevArgs = ref.current.args;
    ref.current.args = args;

    // Compare to previous args and update listeners if any changed or first mount
    updateListeners(args, prevArgs, ref.current.listeners, forceRender);

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            if (ref.current.listeners) {
                ref.current.listeners.forEach(disposeListener);
                ref.current.listeners = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    return args.map((obs) => obs?.value) as MappedProxyValue<T>;
}

const updateListeners = (args: ObsProxy[], prevArgs: ObsProxy[], listeners: ObsListener[], onChange: () => void) => {
    const num = Math.max(args.length, prevArgs ? prevArgs.length : 0);
    for (let i = 0; i < num; i++) {
        const obs = args[i];
        if (!prevArgs || obs !== prevArgs[i]) {
            if (listeners[i]) {
                disposeListener(listeners[i]);
                listeners[i] = undefined;
            }

            if (obs) {
                listeners[i] = listenToObs(obs, onChange);
            }
        }
    }
};

export { useObsProxy };
