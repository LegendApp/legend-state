import type { Observable, ObservableReadable } from '@legendapp/state';
import { findIDKey, getNode, isArray, isFunction, optimized } from '@legendapp/state';
import { createElement, FC, memo, ReactElement, useMemo, useRef } from 'react';
import { observer } from './reactive-observer';
import { useSelector } from './useSelector';

const autoMemoCache = new Map<FC, FC>();

export function For<T, TProps>({
    each,
    eachValues,
    optimized: isOptimized,
    item,
    itemProps,
    sortValues,
    children,
}: {
    each?: ObservableReadable<T[] | Record<any, T> | Map<any, T>>;
    eachValues?: ObservableReadable<Record<any, T> | Map<any, T>>;
    optimized?: boolean;
    item?: FC<{ item: Observable<T>; id?: string } & TProps>;
    itemProps?: TProps;
    sortValues?: (A: T, B: T, AKey: string, BKey: string) => number;
    children?: (value: Observable<T>) => ReactElement;
}): ReactElement | null {
    if (!each && !eachValues) return null;

    if (eachValues) {
        each = eachValues;
        if (process.env.NODE_ENV === 'development') {
            console.log(
                '[legend-state]: "eachValues" prop is deprecated and will be removed in the next major version. Please use "each" prop instead.'
            );
        }
    }

    const obs = each || eachValues;

    // Get the raw value with a shallow listener so this list only re-renders
    // when the array length changes
    const value = useSelector(() => obs.get(isOptimized ? optimized : true));

    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: Observable<T>) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => observer(({ item }) => refChildren.current!(item)), []);
    } else {
        // @ts-expect-error $$typeof is private
        if (item.$$typeof !== Symbol.for('react.memo')) {
            let memod = autoMemoCache.get(item);
            if (!memod) {
                memod = memo(item);
                autoMemoCache.set(item, memod);
            }
            item = memod;
        }
    }

    // This early out needs to be after any hooks
    if (!value) return null;

    // Create the child elements
    const out: ReactElement[] = [];

    const isArr = isArray(value);

    if (isArr) {
        // Get the appropriate id field
        const v0 = value[0] as any;
        const node = getNode(obs);
        const length = (value as any[]).length;

        const idField =
            length > 0
                ? (node && findIDKey(v0, node)) ||
                  (v0.id !== undefined ? 'id' : v0.key !== undefined ? 'key' : undefined)
                : undefined;

        const isIdFieldFunction = isFunction(idField);

        for (let i = 0; i < length; i++) {
            if (value[i]) {
                const val = value[i];
                const key = (isIdFieldFunction ? idField(val) : val[idField as string]) ?? i;
                const props = { key, id: key, item: each[i] };

                out.push(createElement(item as FC, itemProps ? Object.assign(props, itemProps) : props));
            }
        }
    } else {
        // Render the values of the object / Map
        const isMap = value instanceof Map;
        const keys = isMap ? Array.from(value.keys()) : Object.keys(value);
        if (sortValues) {
            keys.sort((A, B) => sortValues(isMap ? value.get(A) : value[A], isMap ? value.get(B) : value[B], A, B));
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (isMap ? value.get(key) : value[key]) {
                const props = { key, id: key, item: isMap ? each.get(key) : each[key] };
                out.push(createElement(item as FC, itemProps ? Object.assign(props, itemProps) : props));
            }
        }
    }

    return out as unknown as ReactElement;
}
