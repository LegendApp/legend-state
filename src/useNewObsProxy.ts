import { useMemo } from 'react';
import { obsProxy } from './ObsProxy';
import { ObsProxy } from './ObsProxyInterfaces';
import { useObsProxy } from './useObsProxy';

function useNewObsProxy<T extends object>(value: T, observe?: boolean): ObsProxy<T> {
    const obs = useMemo(() => obsProxy(value), []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe) {
        useObsProxy(obs);
    }

    return obs;
}

export { useNewObsProxy };
