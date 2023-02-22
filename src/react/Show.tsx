import type { Selector } from '@legendapp/state';
import { isObservableValueReady } from '@legendapp/state';
import { createElement, FC, ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

export function Show<T>(props: {
    if: Selector<T>;
    else?: ReactNode | (() => ReactNode);
    wrap?: FC;
    children: ReactNode | ((value?: T) => ReactNode);
}): ReactElement;
export function Show<T>({
    if: if_,
    else: else_,
    wrap,
    children,
}: {
    if: Selector<T>;
    else?: ReactNode | (() => ReactNode);
    wrap?: FC;
    children: ReactNode | (() => ReactNode);
}): ReactElement {
    const value = useSelector<T>(if_);

    const child = useSelector(isObservableValueReady(value) ? children : else_ ? else_ : null, {
        shouldRender: true,
    }) as ReactElement;

    return wrap ? createElement(wrap, undefined, child) : child;
}
