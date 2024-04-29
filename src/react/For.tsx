import type { Observable, ObservableObject, ObservableParam } from '@legendapp/state';
import { internal, isArray, isFunction, isMap } from '@legendapp/state';
import { FC, ReactElement, createElement, memo, useMemo, useRef } from 'react';
import { observer } from './reactive-observer';
import { useSelector } from './useSelector';
const { findIDKey, getNode, optimized } = internal;

const autoMemoCache = new Map<FC<any>, FC<any>>();

type ForItemProps<T, TProps = {}> = {
    item$: Observable<T>;
    id?: string;
} & TProps;

export function For<T, TProps>({
    each,
    optimized: isOptimized,
    item,
    itemProps,
    sortValues,
    children,
}: {
    each?: ObservableParam<T[] | Record<any, T> | Map<any, T>>;
    optimized?: boolean;
    item?: FC<ForItemProps<T, TProps>>;
    itemProps?: TProps;
    sortValues?: (A: T, B: T, AKey: string, BKey: string) => number;
    children?: (value: Observable<T>, id: string | undefined) => ReactElement;
}): ReactElement | null {
    if (!each) return null;

    // Get the raw value with a shallow listener so this list only re-renders
    // when the array length changes
    const value = useSelector(() => each!.get(isOptimized ? optimized : true));

    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: Observable<T>, id: string | undefined) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => observer(({ item$, id }) => refChildren.current!(item$, id)), []);
    } else {
        // @ts-expect-error $$typeof is private
        if (item.$$typeof !== Symbol.for('react.memo')) {
            let memod = autoMemoCache.get(item!);
            if (!memod) {
                memod = memo(item!);
                autoMemoCache.set(item!, memod);
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
        const node = getNode(each!);
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
                const key = (isIdFieldFunction ? idField(val) : (val as Record<string, any>)[idField as string]) ?? i;
                const item$ = (each as Observable<any[]>)[i];
                // TODOV3 Remove item
                const props: ForItemProps<any> & { key: string; item: Observable<any> } = {
                    key,
                    id: key,
                    item$,
                    item: item$,
                };

                out.push(createElement(item as FC, itemProps ? Object.assign(props, itemProps) : props));
            }
        }
    } else {
        // Render the values of the object / Map
        const asMap = isMap(value);
        const keys = asMap ? Array.from(value.keys()) : Object.keys(value);
        if (sortValues) {
            keys.sort((A, B) => sortValues(asMap ? value.get(A)! : value[A], asMap ? value.get(B)! : value[B], A, B));
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (asMap ? value.get(key) : value[key]) {
                const item$ = asMap ? each!.get(key) : (each as ObservableObject<Record<string, any>>)[key];
                const props: ForItemProps<any> & { key: string; item: Observable<any> } = {
                    key,
                    id: key,
                    item$,
                    item: item$,
                };
                out.push(createElement(item as FC, itemProps ? Object.assign(props, itemProps) : props));
            }
        }
    }

    return out as unknown as ReactElement;
}
