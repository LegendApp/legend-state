import { isFunction } from '@legendapp/tools';
import { useMemo } from 'react';
import { persistObservable } from '../persistObservable';
import { observable } from '../observable';
import { Observable, ValidObservableParam, PersistOptions } from '../observableInterfaces';
import { useObservables } from './useObservables';

function useNewObservable<T>(
    value: (() => ValidObservableParam<T>) | ValidObservableParam<T>,
    observe?: boolean,
    persist?: PersistOptions<T>
): [Observable<T>, T] {
    const obs = useMemo(() => {
        const ret = observable(isFunction(value) ? value() : value);
        if (persist) {
            persistObservable(ret, persist);
        }
        return ret;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (observe !== false) {
        useObservables(() => [obs]);
    }

    return [obs, obs.get()];
}

export { useNewObservable };
