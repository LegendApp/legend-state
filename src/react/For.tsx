import type { Observable, ObservableObject, ObservableReadable } from '@legendapp/state';
import { createElement, FC, ReactElement, useMemo, useRef } from 'react';
import { observer } from './reactive-observer';
import { useSelector } from './useSelector';

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
    const v = useSelector(() => (each as unknown as ObservableObject).get(optimized ? 'optimize' : true));

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
