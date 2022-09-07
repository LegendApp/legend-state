import { isFunction, isObservable, Tracking } from '@legendapp/state';
import { createElement, ReactElement, ReactNode, useMemo, useRef } from 'react';
import type { ObservableObject, ObservableReadable } from '../observableInterfaces';
import { observer } from './observer';

export const Isolate = observer(function Isolate({ children }: { children: () => ReactNode }): ReactElement {
    return (children as () => ReactElement)();
});

export const Memo = observer(
    function Memo({ children }: { children: () => ReactNode }): ReactElement {
        return (children as () => ReactElement)();
    },
    () => true
);

export const Show = observer(function Show({
    if: if_,
    else: else_,
    children,
    memo,
}: {
    if: any;
    else?: () => ReactNode;
    memo?: boolean;
    children: () => ReactNode;
}): ReactElement {
    if (isFunction(if_)) {
        if_ = if_();
    }

    if (isObservable(if_)) {
        if_ = (if_ as ObservableObject).get();
    }

    return if_
        ? ((memo ? useMemo(() => children, []) : children) as () => ReactElement)()
        : else_
        ? (else_ as () => ReactElement)()
        : null;
});

export const For = observer(function For<T extends { id: string } | { _id: string } | { __id: string }>({
    each,
    optimized,
    item,
    children,
}: {
    each?: ObservableReadable<T[]>;
    optimized?: boolean;
    item?: ({ item: T }) => ReactElement;
    children?: (value: T) => ReactElement;
}): ReactElement {
    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: T) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => observer(({ item }) => refChildren.current(item)), []);
    }

    if (!each) return null;

    // Get the raw value with a shallow listener so this list only re-renders
    // when the array length changes
    const v = each.get(optimized ? Tracking.Optimized : Tracking.Shallow) as {
        id?: string;
        _id?: string;
        __id?: string;
    }[];

    if (!v) return null;

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
});
