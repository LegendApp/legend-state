import type { Observable, ObservableReadable } from '@legendapp/state';
import { findIDKey, getNode, isFunction } from '@legendapp/state';
import { createElement, FC, memo, ReactElement, useMemo, useRef } from 'react';
import { observer } from './reactive-observer';
import { useSelector } from './useSelector';

const autoMemoCache = new Map<FC, FC>();

export function For<T, TProps>({
    each,
    eachValues,
    optimized,
    item,
    itemProps,
    sortValues,
    children,
}: {
    each?: ObservableReadable<T[]>;
    eachValues?: ObservableReadable<Record<any, T>>;
    optimized?: boolean;
    item?: FC<{ item: Observable<T>; id?: string } & TProps>;
    itemProps?: TProps;
    sortValues?: (A: T, B: T, AKey: string, BKey: string) => number;
    children?: (value: Observable<T>) => ReactElement;
}): ReactElement | null {
    if (!each && !eachValues) return null;

    const obs = each || eachValues;

    // Get the raw value with a shallow listener so this list only re-renders
    // when the array length changes
    const value = useSelector(() => obs.get(optimized ? 'optimize' : true));

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

    // If using eachValues, render the values of the object
    if (eachValues) {
        const keys = Object.keys(value);
        if (sortValues) {
            keys.sort((A, B) => sortValues(value[A], value[B], A, B));
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (value[key]) {
                out.push(
                    createElement(
                        item as FC,
                        Object.assign({ key: key as string, item: eachValues[key], id: key }, itemProps)
                    )
                );
            }
        }
    } else {
        // Get the appropriate id field
        const v0 = value[0];
        const node = getNode(obs);

        const idField =
            value.length > 0
                ? (node && findIDKey(v0, node)) ||
                  (v0.id !== undefined ? 'id' : v0.key !== undefined ? 'key' : undefined)
                : undefined;

        const isIdFieldFunction = isFunction(idField);

        for (let i = 0; i < value.length; i++) {
            if (value[i]) {
                const val = value[i];
                const key = (isIdFieldFunction ? idField(val) : val[idField as string]) ?? i;

                out.push(createElement(item as FC, Object.assign({ key: key, item: each[i], id: key }, itemProps)));
            }
        }
    }

    return out as unknown as ReactElement;
}
