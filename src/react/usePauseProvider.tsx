import { Observable, observable } from '@legendapp/state';
import { ReactNode, createContext, createElement, useState } from 'react';

export const PauseContext = createContext<Observable<boolean>>(null as any);

export function usePauseProvider() {
    const [value] = useState(() => observable(false));
    return {
        PauseProvider: ({ children }: { children: ReactNode }) =>
            createElement(PauseContext.Provider, { value }, children),
        isPaused$: value,
    };
}
