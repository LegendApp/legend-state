import { isFunction, isObservable, Tracking } from '@legendapp/state';
import { useComputed } from '@legendapp/state/react';
import { createElement, memo, ReactElement, ReactNode, useMemo, useRef } from 'react';
import type { NotPrimitive, ObservableObject } from '../observableInterfaces';

function computeProp(p) {
    return useComputed(() => {
        if (isFunction(p)) {
            p = p();
        }

        if (isObservable(p)) {
            p = p.get();
        }
        return p;
    });
}

export function Isolate({ children }: { children: () => ReactNode }): ReactElement {
    return useComputed(children) as ReactElement;
}

export const Memo = memo(
    function Memo({ children }: { children: () => ReactNode }): ReactElement {
        return useComputed(children) as ReactElement;
    },
    () => true
);

export function Show<T>({
    if: if_,
    else: else_,
    children,
    memo,
}: {
    if: NotPrimitive<T>;
    else?: ReactElement | (() => ReactElement);
    memo?: boolean;
    children: () => ReactElement;
}): ReactElement {
    return computeProp(if_)
        ? ((memo ? useMemo(() => children, []) : children) as () => ReactElement)()
        : else_
        ? isFunction(else_)
            ? (else_ as () => ReactElement)()
            : else_
        : null;
}

export function Switch<T>({
    value,
    fallback,
    children,
}: {
    value: NotPrimitive<T>;
    fallback?: ReactElement | (() => ReactElement);
    children?: Record<any, () => ReactElement>;
}): ReactElement {
    return children[computeProp(value)]?.() ?? (fallback ? (isFunction(fallback) ? fallback() : fallback) : null);
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
            }[]
    );

    if (!v) return null;

    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: T) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => memo(({ item }) => useComputed(() => refChildren.current(item))), []);
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
