import { Observable, observable } from '@legendapp/state';
import React from 'react';

export function createObservableHook<TArgs extends any[], TRet>(
    fn: (...args: TArgs) => TRet
): (...args: TArgs) => Observable<TRet> {
    return function (...args) {
        const refObs = React.useRef<Observable<TRet>>();
        const useState = React.useState;
        // @ts-ignore
        React.useState = function <S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
            const obs = refObs.current ?? (refObs.current = observable(initialState) as Observable<TRet>);
            return [obs.get() as S, obs.set] as [S, React.Dispatch<React.SetStateAction<S>>];
        };
        fn(...args);
        React.useState = useState;

        return refObs.current;
    };
}
