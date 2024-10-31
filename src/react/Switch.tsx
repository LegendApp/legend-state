import type { Selector } from '@legendapp/state';
import { ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

export function Switch<T extends object>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Partial<Record<keyof T | 'null' | 'undefined' | 'default', () => ReactNode>>;
}): ReactElement | null;
export function Switch<T extends string | number | symbol>({
    value,
    children,
}: {
    value?: Selector<T | undefined | null>;
    children: Partial<Record<T | 'null' | 'undefined' | 'default', () => ReactNode>>;
}): ReactElement | null;
export function Switch<T extends boolean>({
    value,
    children,
}: {
    value?: Selector<T | undefined | null>;
    children: Partial<Record<'false' | 'true' | 'null' | 'undefined' | 'default', () => ReactNode>>;
}): ReactElement | null;
export function Switch<T>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Partial<Record<'undefined' | 'default', () => ReactNode>>;
}): ReactElement | null;
export function Switch<T>({
    value,
    children,
}: {
    value?: Selector<T>;
    children: Partial<Record<any, () => ReactNode>>;
}): ReactNode {
    // Select from an object of cases
    const child = children[useSelector(value)!];
    return (child ? child() : children['default']?.()) ?? null;
}
