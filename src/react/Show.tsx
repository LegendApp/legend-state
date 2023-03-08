import type { Selector } from '@legendapp/state';
import { computeSelector, isObservableValueReady } from '@legendapp/state';
import { createElement, FC, ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

interface PropsIf<T> {
    if: Selector<T>;
    ifHasData?: never;
}
interface PropsIfHasData<T> {
    if?: never;
    ifHasData: Selector<T>;
}

interface PropsBase {
    else?: ReactNode | (() => ReactNode);
    wrap?: FC;
    children: ReactNode | ((value?: T) => ReactNode);
}

type Props<T> = PropsBase & (PropsIf<T> | PropsIfHasData<T>);

export function Show<T>(props: Props<T>): ReactElement;
export function Show<T>({ if: if_, ifHasData, else: else_, wrap, children }: Props<T>): ReactElement {
    const child = useSelector(
        ifHasData !== undefined
            ? isObservableValueReady(computeSelector(ifHasData))
            : computeSelector(if_)
            ? children
            : else_
            ? else_
            : null,
        {
            shouldRender: true,
        }
    ) as ReactElement;

    return wrap ? createElement(wrap, undefined, child) : child;
}
