import { ReactElement, ReactNode } from 'react';
import type { Observable } from '../observableTypes';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: Observable<any> | (() => ReactNode) }): ReactElement {
    return useSelector(children) as ReactElement;
}
