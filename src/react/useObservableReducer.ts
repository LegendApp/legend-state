import type { Observable } from '@legendapp/state';
import type {
    Dispatch,
    DispatchWithoutAction,
    Reducer,
    ReducerAction,
    ReducerState,
    ReducerStateWithoutAction,
    ReducerWithoutAction,
} from 'react';
import { useObservable } from 'src/react/useObservable';

export function useObservableReducer<R extends ReducerWithoutAction<any>, I>(
    reducer: R,
    initializerArg: I,
    initializer: (arg: I) => ReducerStateWithoutAction<R>
): [Observable<ReducerStateWithoutAction<R>>, DispatchWithoutAction];
export function useObservableReducer<R extends ReducerWithoutAction<any>>(
    reducer: R,
    initializerArg: ReducerStateWithoutAction<R>,
    initializer?: undefined
): [Observable<ReducerStateWithoutAction<R>>, DispatchWithoutAction];
export function useObservableReducer<R extends Reducer<any, any>, I>(
    reducer: R,
    initializerArg: I & ReducerState<R>,
    initializer: (arg: I & ReducerState<R>) => ReducerState<R>
): [Observable<ReducerState<R>>, Dispatch<ReducerAction<R>>];
export function useObservableReducer<R extends Reducer<any, any>, I>(
    reducer: R,
    initializerArg: I,
    initializer: (arg: I) => ReducerState<R>
): [Observable<ReducerState<R>>, Dispatch<ReducerAction<R>>];
export function useObservableReducer<R extends Reducer<any, any>>(
    reducer: R,
    initialState: ReducerState<R>,
    initializer?: undefined
): [Observable<ReducerState<R>>, Dispatch<ReducerAction<R>>];
export function useObservableReducer<R extends Reducer<any, any>, I>(
    reducer: R,
    initializerArg: I & ReducerState<R>,
    initializer: (arg: I & ReducerState<R>) => ReducerState<R>
): [Observable<ReducerState<R>>, Dispatch<ReducerAction<R>>] {
    const obs = useObservable(initializerArg !== undefined ? initializer(initializerArg) : initializerArg);
    const dispatch = (action) => {
        obs.set(reducer(obs.get(), action));
    };

    return [obs, dispatch];
}
