import { useForceRender } from '@legendapp/tools';
import { useEffect, useRef } from 'react';
import { listenToObs } from '../ObsProxyFns';
import { MappedProxyValue, ObsListener, ObsProxy, ObsProxyChecker, ObsProxyUnsafe } from '../ObsProxyInterfaces';
import { disposeListener } from '../ObsProxyListener';

interface SavedRef {
    args?: ObsProxyChecker[];
    primitives?: [ObsProxy, string][];
    listeners?: ObsListener[];
}

function useObsProxy<T extends ObsProxyChecker[]>(...args: T): MappedProxyValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: [],
        };
    }

    // Compare to previous args and update listeners if any changed or first mount
    updateListeners(args, ref.current.args, ref.current.listeners, forceRender);

    ref.current.args = args;

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

    return args.map((obs) => (obs ? obs.get() : obs)) as MappedProxyValue<T>;
}

const updateListeners = (
    args: ObsProxyChecker[],
    prevArgs: (ObsProxy | ObsProxyUnsafe)[],
    listeners: ObsListener[],
    onChange: () => void
) => {
    const num = Math.max(args.length, prevArgs ? prevArgs.length : 0);
    for (let i = 0; i < num; i++) {
        let obs = args[i];
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
