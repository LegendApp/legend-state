import { ReactElement, ReactNode } from 'react';
import type { Selector } from '../observableInterfaces';
import { useSelector } from './useSelector';

// TODOV2 Remove this in favor of Obs.$
export function Computed({ children }: { children: Selector<ReactNode> }): ReactElement {
    return useSelector(children) as ReactElement;
}
