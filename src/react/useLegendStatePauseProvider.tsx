import { Observable, observable } from '@legendapp/state';
import { ReactNode, createContext, createElement, useState } from 'react';

export const LegendStatePauseContext = createContext<Observable<boolean>>(null as any);

export function useLegendStatePauseProvider() {
    const [value] = useState(() => observable(false));
    return {
        LegendStatePauseProvider: ({ children }: { children: ReactNode }) =>
            createElement(LegendStatePauseContext.Provider, { value }, children),
        isPaused$: value,
    };
}
