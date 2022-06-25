import { isArray, useForceRender } from '@legendapp/tools';
import { useEffect, useRef } from 'react';
import { listenToObs } from './ObsProxyFns';
import { ObsListener, ObsProxy, ObsProxyChecker, ObsProxyUnsafe } from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';

interface SavedRef {
    args?: ObsProxyUnsafe[];
    listeners?: ObsListener[];
}

function useObsProxy<T extends (ObsProxyChecker | [ObsProxyChecker, string])[]>(...args: T): T {
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

    return args;
}

const updateListeners = (
    args: (ObsProxy | ObsProxyUnsafe | [ObsProxy, string] | [ObsProxyUnsafe, string])[],
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
                let prop: string;
                if (isArray(obs)) {
                    prop = obs[1];
                    obs = obs[0];
                    listeners[i] = listenToObs(obs as ObsProxy<Record<string, any>>, prop, onChange);
                } else {
                    listeners[i] = listenToObs(obs, onChange);
                }
            }
        }
    }
};

export { useObsProxy };
