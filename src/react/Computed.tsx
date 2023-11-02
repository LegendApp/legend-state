import { ReactElement, ReactNode } from 'react';
import type { ObservableReadable } from '../observableTypes';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: ObservableReadable | (() => ReactNode) }): ReactElement {
    return useSelector(children, { skipCheck: true }) as ReactElement;
}
