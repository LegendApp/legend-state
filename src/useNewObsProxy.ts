import { obsProxy } from './ObsProxy';
import { useObsProxy } from './useObsProxy';
import { useMemo } from 'react';
import { ObsProxy } from './ObsProxyInterfaces';

function useNewObsProxy<T extends object>(value: T): [ObsProxy<T>];
function useNewObsProxy<T extends object>(value: T, observe: boolean): [ObsProxy<T>, T];
function useNewObsProxy<T extends object>(value: T, observe?: boolean): [ObsProxy<T>, T?] {
    const obs = useMemo(() => obsProxy(value), []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe) {
        const [val] = useObsProxy(obs); // eslint-disable-line react-hooks/exhaustive-deps
        return [obs, val];
    }

    return [obs];
}

export { useNewObsProxy };
