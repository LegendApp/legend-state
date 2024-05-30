import { computeSelector } from '@legendapp/state';
import { ReactElement, ReactNode } from 'react';
import type { ObservableParam } from '@legendapp/state';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: ObservableParam | (() => ReactNode) }): ReactElement {
    return useSelector(() => computeSelector(computeSelector(children)), { skipCheck: true }) as ReactElement;
}
