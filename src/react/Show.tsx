import type { Observable, Selector } from '@legendapp/state';
import { isFunction, isObservableValueReady } from '@legendapp/state';
import { FC, ReactElement, ReactNode, createElement } from 'react';
import { useSelector } from './useSelector';

interface PropsIf<T> {
    if: Selector<T>;
    ifReady?: never;
}
interface PropsIfReady<T> {
    if?: never;
    ifReady: Selector<T>;
}

interface PropsBase<T> {
    else?: ReactNode | (() => ReactNode);
    $value?: Observable<T>;
    wrap?: FC;
    children: ReactNode | ((value?: T) => ReactNode);
}

type Props<T> = PropsBase<T> & (PropsIf<T> | PropsIfReady<T>);

export function Show<T>(props: Props<T>): ReactElement;
export function Show<T>({ if: if_, ifReady, else: else_, $value, wrap, children }: Props<T>): ReactElement {
    const value = useSelector(if_ ?? ifReady);
    const show = ifReady !== undefined ? isObservableValueReady(value) : value;
    const child = useSelector(
        show
            ? isFunction(children)
                ? () => children($value ? $value.get() : value)
                : (children as any)
            : (else_ ?? null),
        { skipCheck: true },
    );

    return wrap ? createElement(wrap, undefined, child) : child;
}
