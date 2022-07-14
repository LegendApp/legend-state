import { isFunction } from '@legendapp/tools';
import { useMemo } from 'react';
import { obsProxy } from '../ObsProxy';
import { ObsProxy, ValidObsProxyParam } from '../ObsProxyInterfaces';
import { useObsProxy } from './useObsProxy';

function useNewObsProxy<T>(
    value: ValidObsProxyParam<T> | (() => ValidObsProxyParam<T>),
    observe?: boolean
): [ObsProxy<T>, T] {
    const obs = useMemo(() => obsProxy(isFunction(value) ? value() : value), []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe) {
        useObsProxy(() => [obs]);
    }

    return [obs, obs.get()];
}

export { useNewObsProxy };
