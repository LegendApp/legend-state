import { Observable, ObservableBoolean, observable } from '@legendapp/state';
import { Context, ReactNode, createContext, createElement, useState } from 'react';

let pauseContext: Context<ObservableBoolean> | undefined = undefined;
export const getPauseContext = () => {
    return (pauseContext ||= createContext<Observable<boolean>>(null as any));
};

export function usePauseProvider() {
    const [value] = useState(() => observable(false));
    return {
        PauseProvider: ({ children }: { children: ReactNode }) =>
            createElement(getPauseContext().Provider, { value }, children),
        isPaused$: value,
    };
}
