import { ReactElement, ReactNode } from 'react';
import type { Selector } from '../observableInterfaces';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: Selector<ReactNode> }): ReactElement {
    return useSelector(children) as ReactElement;
}
