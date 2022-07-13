import { isFunction } from '@legendapp/tools';
import { useMemo } from 'react';
import { obsProxy } from '../ObsProxy';
import { ObsProxy } from '../ObsProxyInterfaces';
import { useObsProxy } from './useObsProxy';

function useNewObsProxy<T>(value: T | (() => T), observe?: boolean): [ObsProxy<T>, T] {
    const obs = useMemo(() => obsProxy(isFunction(value) ? value() : value), []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe) {
        useObsProxy(() => [obs]);
    }

    return [obs, obs.get()];
}

export { useNewObsProxy };
