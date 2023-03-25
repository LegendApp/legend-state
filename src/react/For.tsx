import type { Observable, ObservableReadable } from '@legendapp/state';
import { createElement, FC, ReactElement, useMemo, useRef } from 'react';
import { observer } from './reactive-observer';
import { useSelector } from './useSelector';

export function For<T, TProps>({
    each,
    eachValues,
    optimized,
    item,
    itemProps,
    children,
}: {
    each?: ObservableReadable<(T & ({ id: string | number } | { _id: string | number } | { __id: string | number }))[]>;
    eachValues?: ObservableReadable<Record<any, T>>;
    optimized?: boolean;
    item?: FC<{ item: Observable<T> } & TProps>;
    itemProps?: TProps;
    children?: (value: Observable<T>) => ReactElement;
}): ReactElement | null {
    if (!each && !eachValues) return null;

    // Get the raw value with a shallow listener so this list only re-renders
    // when the array length changes
    const value = useSelector(() => (each || eachValues).get(optimized ? 'optimize' : true));

    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: Observable<T>) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => observer(({ item }) => refChildren.current!(item)), []);
    }

    if (!value) return null;

    // Create the child elements
    const out: ReactElement[] = [];

    // If using eachValues, render the values of the object
    if (eachValues) {
        for (const key in value) {
            if (value[key]) {
                out.push(
                    createElement(item as FC, Object.assign({ key: key, item: eachValues[key], id: key }, itemProps))
                );
            }
        }
    } else {
        // Get the appropriate id field
        const id =
            value.length > 0
                ? value[0].id
                    ? 'id'
                    : value[0]._id
                    ? '_id'
                    : value[0].__id
                    ? '__id'
                    : undefined
                : undefined;

        for (let i = 0; i < value.length; i++) {
            if (value[i]) {
                const key = value[i][id as string] ?? i;

                out.push(createElement(item as FC, Object.assign({ key: key, item: each[i], id: key }, itemProps)));
            }
        }
    }

    return out as unknown as ReactElement;
}
