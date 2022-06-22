import { useForceRender } from '@legendapp/tools';
import { useCallback, useEffect, useRef } from 'react';
import { listenToObs } from './ObsProxyFns';
import { MappedProxyValue, ObsListener, ObsProxy } from './ObsProxyInterfaces';
import { disposeListener } from './ObsProxyListener';

interface SavedRef {
    args?: ObsProxy[];
    prevArgs?: ObsProxy[];
    listeners?: ObsListener[];
}

function useObsProxy<T extends ObsProxy<any>[]>(...args: T): MappedProxyValue<T> {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: [],
        };
    }

    // Change handler
    const onChange = useCallback(() => {
        if (ref.current.listeners.length) {
            forceRender();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Compare to previous args and update listeners if any changed or first mount
    ref.current.args = args;

    const prevArgs = ref.current.prevArgs;
    if (prevArgs !== args) {
        doListening(args, prevArgs, ref.current.listeners, onChange);
        ref.current.prevArgs = args;
    }

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            if (ref.current.listeners) {
                ref.current.listeners?.forEach((listener) => listener && disposeListener(listener));
                ref.current.listeners = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    return args.map((obs) => obs?.value) as MappedProxyValue<T>;
}

const doListening = (args: ObsProxy[], prevArgs: ObsProxy[], listeners: ObsListener[], onChange: () => void) => {
    const num = Math.max(args.length, prevArgs ? prevArgs.length : 0);
    for (let i = 0; i < num; i++) {
        const obs = args[i];
        if (obs && (!prevArgs || obs !== prevArgs[i])) {
            if (prevArgs?.[i] && listeners[i]) {
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
