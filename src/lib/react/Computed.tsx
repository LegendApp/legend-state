import { ReactElement, ReactNode } from 'react';
import type { ObservableReadable } from '../observableInterfaces';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: ObservableReadable | (() => ReactNode) }): ReactElement {
    return useSelector(children) as ReactElement;
}
