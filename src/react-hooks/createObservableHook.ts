import { isFunction, Observable, observable } from '@legendapp/state';
import React, { MutableRefObject, Reducer, ReducerState } from 'react';

function overrideHooks<TRet>(refObs: MutableRefObject<Observable<TRet> | undefined>) {
    // @ts-expect-error Types don't match React's expected types
    React.useState = function useState(initialState: TRet | (() => TRet)) {
        const obs =
            refObs.current ??
            (refObs.current = observable((isFunction(initialState) ? initialState() : initialState) as any) as any);
        return [obs.get() as TRet, obs.set] as [TRet, React.Dispatch<React.SetStateAction<TRet>>];
    };
    // @ts-expect-error Types don't match React's expected types
    React.useReducer = function useReducer<R extends Reducer<any, any>>(
        reducer: R,
        initializerArg: ReducerState<R>,
        initializer: (arg: ReducerState<R>) => ReducerState<R>,
    ) {
        const obs =
            refObs.current ??
            (refObs.current = observable(
                initializerArg !== undefined && isFunction(initializerArg)
                    ? initializer(initializerArg)
                    : initializerArg,
            ) as any);
        const dispatch = (action: any) => {
            obs.set(reducer(obs.get(), action));
        };
        return [obs, dispatch];
    };
}

export function createObservableHook<TArgs extends any[], TRet>(
    fn: (...args: TArgs) => TRet,
): (...args: TArgs) => Observable<TRet> {
    const _useState = React.useState;
    const _useReducer = React.useReducer;

    return function (...args: TArgs) {
        const refObs = React.useRef<Observable<TRet>>();

        // First override the built-in hooks to create/update observables
        overrideHooks(refObs);

        // Then call the original hook
        fn(...args);

        // And reset back to the built-in hooks
        React.useState = _useState;
        React.useReducer = _useReducer;

        return refObs.current as Observable<TRet>;
    };
}
