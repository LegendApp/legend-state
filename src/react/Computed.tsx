import { ReactElement, ReactNode } from 'react';
import type { ObservableParam } from '../observableTypes';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: ObservableParam | (() => ReactNode) }): ReactElement {
    return useSelector(children, { skipCheck: true }) as ReactElement;
}
