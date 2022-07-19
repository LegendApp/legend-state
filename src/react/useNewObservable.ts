import { isFunction } from '@legendapp/tools';
import { useMemo } from 'react';
import { observable } from '../observable';
import { Observable, ValidObservableParam } from '../types/observableInterfaces';
import { useObservables } from './useObservables';

function useNewObservable<T>(
    value: ValidObservableParam<T> | (() => ValidObservableParam<T>),
    observe?: boolean
): [Observable<T>, T] {
    const obs = useMemo(() => observable(isFunction(value) ? value() : value), []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe !== false) {
        useObservables(() => [obs]);
    }

    return [obs, obs.get()];
}

export { useNewObservable };
