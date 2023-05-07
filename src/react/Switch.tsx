import type { Selector } from '@legendapp/state';
import { ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

export function Switch<T>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Record<keyof T, () => ReactNode>;
}): ReactNode {
    // Select from an object of cases
    return ((children as Record<any, () => ReactNode>)[useSelector(value)]?.() ??
        (children as Record<any, () => ReactNode>)['default']?.() ??
        null) as ReactElement;
}
