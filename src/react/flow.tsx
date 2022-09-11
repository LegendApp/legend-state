import { isFunction, isObservable, Tracking } from '@legendapp/state';
import { createElement, memo, ReactElement, ReactNode, useMemo, useRef } from 'react';
import type { NotPrimitive, ObservableObject } from '../observableInterfaces';
import { useComputed } from './useComputed';

function computeProp(prop) {
    return useComputed(() => {
        let p = prop;
        if (isFunction(p)) {
            p = p();
        }

        if (isObservable(p)) {
            p = p.get();
        }
        return p;
    });
}

export function Computed({ children }: { children: () => ReactNode }): ReactElement {
    return useComputed(children, true) as ReactElement;
}

export const Memo = memo(
    function Memo({ children }: { children: () => ReactNode }): ReactElement {
        return useComputed(children, true) as ReactElement;
    },
    () => true
);

export function Show<T>(props: {
    if: NotPrimitive<T>;
    else?: ReactNode | (() => ReactNode);
    memo: true;
    children: (value?: T) => ReactNode;
}): ReactElement;
export function Show<T>(props: {
    if: NotPrimitive<T>;
    else?: ReactNode | (() => ReactNode);
    memo?: false;
    children: ReactNode | ((value?: T) => ReactNode);
}): ReactElement;
export function Show<T>({
    if: if_,
    else: else_,
    memo,
    children,
}: {
    if: NotPrimitive<T>;
    else?: ReactNode | (() => ReactNode);
    memo?: boolean;
    children: ReactNode | ((value?: T) => ReactNode);
}): ReactElement {
    if (memo && children) {
        if (process.env.NODE_ENV === 'development' && !isFunction(children)) {
            throw new Error('[legend-state] The memo prop on Show requires children to be a function');
        }
        children = useMemo<ReactElement>(children as () => ReactElement, []);
    }
    const value = computeProp(if_);
    return (
        value
            ? isFunction(children)
                ? children(value)
                : children
            : else_
            ? isFunction(else_)
                ? else_()
                : else_
            : null
    ) as ReactElement;
}

export function Switch<T>({
    value,
    children,
}: {
    value: NotPrimitive<T>;
    children?: Record<any, () => ReactNode>;
}): ReactElement {
    return (children[computeProp(value)]?.() ?? children['default']?.() ?? null) as ReactElement;
}

export function For<
    T extends ObservableObject<{ id: string | number } | { _id: string | number } | { __id: string | number }>
>({
    each,
    optimized,
    item,
    children,
}: {
    each?: T[];
    optimized?: boolean;
    item?: (props: { item: T }) => ReactElement;
    children?: (value: T) => ReactElement;
}): ReactElement {
    if (!each) return null;

    // Get the raw value with a shallow listener so this list only re-renders
    // when the array length changes
    const v = useComputed(
        () =>
            (each as ObservableObject).get(optimized ? Tracking.optimized : Tracking.shallow) as {
                id?: string;
                _id?: string;
                __id?: string;
            }[],
        true
    );

    if (!v) return null;

    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: T) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => memo(({ item }) => useComputed(() => refChildren.current(item), true)), []);
    }

    // Get the appropriate id field
    const id = v.length > 0 ? (v[0].id ? 'id' : v[0]._id ? '_id' : v[0].__id ? '__id' : undefined) : undefined;

    // Create the child elements
    let out: ReactElement[] = [];
    for (let i = 0; i < v.length; i++) {
        if (v[i]) {
            const key = v[i][id] as string;

            out.push(createElement(item, { key: key, item: each[i] }));
        }
    }

    return out as unknown as ReactElement;
}
