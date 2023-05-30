import type { Selector } from '@legendapp/state';
import { ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

export function Switch<T extends object>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Partial<Record<keyof T | 'null' | 'undefined' | 'default', () => ReactNode>>;
}): ReactElement;
export function Switch<T extends string | number | symbol>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Partial<Record<T | 'null' | 'undefined' | 'default', () => ReactNode>>;
}): ReactElement;
export function Switch<T extends boolean>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Partial<Record<'false' | 'true' | 'null' | 'undefined' | 'default', () => ReactNode>>;
}): ReactElement;
export function Switch<T>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Record<any, () => ReactNode>;
}): ReactElement {
    // Select from an object of cases
    return ((children as Record<any, () => ReactNode>)[useSelector(value)]?.() ??
        (children as Record<any, () => ReactNode>)['default']?.() ??
        null) as ReactElement;
}
