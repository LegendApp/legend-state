import { ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: () => ReactNode }): ReactElement {
    return useSelector(children, { shouldRender: true }) as ReactElement;
}
