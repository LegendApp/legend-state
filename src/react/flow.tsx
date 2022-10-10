import { isFunction } from '@legendapp/state';
import { createElement, FC, memo, ReactElement, ReactNode, useMemo, useRef } from 'react';
import type { Observable, ObservableObject, ObservableReadable, Selector } from '../observableInterfaces';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: () => ReactNode }): ReactElement {
    return useSelector(children, { shouldRender: true }) as ReactElement;
}

export const Memo = memo(
    function Memo({ children }: { children: () => ReactNode }): ReactElement {
        return useSelector(children, { shouldRender: true }) as ReactElement;
    },
    () => true
);

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

    const child = (
        value ? (isFunction(children) ? children() : children) : else_ ? (isFunction(else_) ? else_() : else_) : null
    ) as ReactElement;

    return wrap ? createElement(wrap, undefined, child) : child;
}

export function Switch<T>({
    value,
    children,
}: {
    value: Selector<T>;
    children?: Record<any, () => ReactNode>;
}): ReactElement {
    return (children[useSelector(value)]?.() ?? children['default']?.() ?? null) as ReactElement;
}

export function For<T extends { id: string | number } | { _id: string | number } | { __id: string | number }>({
    each,
    optimized,
    item,
    children,
}: {
    each?: ObservableReadable<T[]>;
    optimized?: boolean;
    item?: (props: { item: Observable<T> }) => ReactElement;
    children?: (value: Observable<T>) => ReactElement;
}): ReactElement {
    if (!each) return null;

    // Get the raw value with a shallow listener so this list only re-renders
    // when the array length changes
    const v = useSelector(() => (each as unknown as ObservableObject).get(optimized ? 'optimize' : (true as any)), {
        shouldRender: true,
    });

    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: Observable<T>) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => memo(({ item }) => refChildren.current(item)), []);
    }

    if (!v) return null;

    // Get the appropriate id field
    const id = v.length > 0 ? (v[0].id ? 'id' : v[0]._id ? '_id' : v[0].__id ? '__id' : undefined) : undefined;

    // Create the child elements
    let out: ReactElement[] = [];
    for (let i = 0; i < v.length; i++) {
        if (v[i]) {
            const key = v[i][id] ?? i;

            out.push(createElement(item, { key: key, item: each[i] }));
        }
    }

    return out as unknown as ReactElement;
}
