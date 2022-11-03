import { isFunction, Observable, observable } from '@legendapp/state';
import React from 'react';

export function createObservableHook<TArgs extends any[], TRet>(
    fn: (...args: TArgs) => TRet
): (...args: TArgs) => Observable<TRet> {
    const _useState = React.useState;

    return function (...args) {
        const refObs = React.useRef<Observable<TRet>>();
        // @ts-ignore
        React.useState = function useState(initialState: TRet | (() => TRet)): [TRet, Dispatch<SetStateAction<TRet>>] {
            const obs =
                refObs.current ??
                (refObs.current = observable(
                    isFunction(initialState) ? initialState() : initialState
                ) as Observable<TRet>);
            return [obs.get() as TRet, obs.set] as [TRet, React.Dispatch<React.SetStateAction<TRet>>];
        };

        fn(...args);
        React.useState = _useState;

        return refObs.current;
    };
}
