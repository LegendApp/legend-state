import { computeSelector, isObservableValueReady } from '@legendapp/state';
import { Children, createElement, FC, memo, ReactElement, ReactNode, useMemo, useRef } from 'react';
import type { Observable, ObservableObject, ObservableReadable, Selector } from '../observableInterfaces';
import { observer } from './reactive-observer';
import { useSelector } from './useSelector';

export function Computed({ children }: { children: () => ReactNode }): ReactElement {
    return useSelector(children, { shouldRender: true }) as ReactElement;
}

export const Memo = /*#__PURE__*/ memo(
    // eslint-disable-next-line react/prop-types
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

    const child = useSelector(isObservableValueReady(value) ? children : else_ ? else_ : null, {
        shouldRender: true,
    }) as ReactElement;

    return wrap ? createElement(wrap, undefined, child) : child;
}

export function Switch<T>(props: {
    value: Selector<T>;
    children: Record<any, () => ReactNode>;
    default?: ReactNode;
}): ReactElement;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Switch<T>(props: { children: ReactNode[]; default?: ReactNode }): ReactElement;
export function Switch<T>({
    value,
    children,
    default: fallback,
}: {
    value?: Selector<T>;
    children: ReactNode[] | Record<any, () => ReactNode>;
    default?: ReactNode;
}): ReactNode {
    if (value !== undefined) {
        // If value then this is selecting from an object of cases
        return ((children as Record<any, () => ReactNode>)[useSelector(value)]?.() ??
            (children as Record<any, () => ReactNode>)['default']?.() ??
            null) as ReactElement;
    } else {
        // If no value then render the first Show child with a matching if prop
        const arr = Children.toArray(children as ReactNode[]);
        const index = useSelector(() => {
            for (let i = 0; i < arr.length; i++) {
                if (computeSelector((arr[i] as any).props.if)) return i;
            }
            return -1;
        });
        return index >= 0 ? arr[index] : fallback ?? null;
    }
}

export function For<T extends { id: string | number } | { _id: string | number } | { __id: string | number }, TProps>({
    each,
    optimized,
    item,
    itemProps,
    children,
}: {
    each?: ObservableReadable<T[]>;
    optimized?: boolean;
    item?: FC<{ item: Observable<T> } & TProps>;
    itemProps?: TProps;
    children?: (value: Observable<T>) => ReactElement;
}): ReactElement | null {
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

        item = useMemo(() => observer(({ item }) => refChildren.current!(item)), []);
    }

    if (!v) return null;

    // Get the appropriate id field
    const id = v.length > 0 ? (v[0].id ? 'id' : v[0]._id ? '_id' : v[0].__id ? '__id' : undefined) : undefined;

    // Create the child elements
    const out: ReactElement[] = [];
    for (let i = 0; i < v.length; i++) {
        if (v[i]) {
            const key = v[i][id as string] ?? i;

            out.push(createElement(item as FC, Object.assign({ key: key, item: each[i] }, itemProps)));
        }
    }

    return out as unknown as ReactElement;
}
